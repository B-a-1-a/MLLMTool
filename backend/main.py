from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, CrossEncoder
import torch
import re
import nltk
from nltk.tokenize import sent_tokenize
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import numpy as np

# Download necessary NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Update these paths to point to your model directories
EMBEDDING_MODEL_PATH = "./enhanced_transcript_highlighter"
RERANKER_MODEL_PATH = "cross-encoder/ms-marco-MiniLM-L-12-v2"

# First, try to load your custom embedding model
try:
    embedding_model = SentenceTransformer(EMBEDDING_MODEL_PATH)
    print(f"Successfully loaded embedding model from {EMBEDDING_MODEL_PATH}")
except Exception as e:
    print(f"Error loading custom embedding model: {e}")
    # Fallback to a pretrained model if the custom model isn't available
    try:
        # Use a better model for question-answering if possible
        embedding_model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
        print("Falling back to default SentenceTransformer model")
    except Exception as e:
        print(f"Error loading fallback embedding model: {e}")
        raise

# Load the reranker model
try:
    reranker_model = CrossEncoder(RERANKER_MODEL_PATH)
    print(f"Successfully loaded reranker model: {RERANKER_MODEL_PATH}")
except Exception as e:
    print(f"Error loading reranker model: {e}")
    reranker_model = None
    print("Reranking will be disabled")

class QuestionRequest(BaseModel):
    question: str
    context: str
    threshold: float = 0.7  # Higher default threshold for stricter filtering 
    chunk_size: int = 4     # Number of sentences per chunk
    chunk_overlap: int = 2  # Number of overlapping sentences between chunks
    top_k_retrieval: int = 15  # Number of chunks to retrieve in first stage
    top_k_final: int = 3    # Number of chunks to keep after reranking
    max_highlight_sentences: int = 1  # Default to highlighting a single sentence
    hybrid_search_weight: float = 0.3  # Weight for keyword component in hybrid search (0-1)
    answer_strictness: float = 0.8  # Higher values select only the most specific answers (0-1)
    score_gap_threshold: float = 0.15  # Minimum score gap needed to distinguish the best answer

def segment_sentences(text):
    """
    Segments text into sentences and then further segments complex sentences.
    """
    # First, use NLTK to split into base sentences
    basic_sentences = sent_tokenize(text)
    
    # Then, split complex list-like sentences
    final_sentences = []
    for sentence in basic_sentences:
        # If the sentence contains a list pattern with multiple items
        if (', and ' in sentence or '; and ' in sentence) and sentence.count(',') >= 2:
            # Look for list patterns like "X like A, B, and C" or "X including A, B, and C"
            list_pattern = re.search(r'(like|including|such as|e\.g\.|i\.e\.|are)([^,.]*,.*?, and .*)', sentence)
            if list_pattern:
                # Split the list items into separate sentences
                intro = sentence[:list_pattern.start(2)]
                items = list_pattern.group(2).split(', and ')
                if len(items) > 1:
                    last_item = items[-1]
                    other_items = items[0].split(', ')
                    for item in other_items:
                        final_sentences.append(f"{intro} {item}")
                    final_sentences.append(f"{intro} {last_item}")
                    continue
        
        # Keep sentences that don't match the pattern
        final_sentences.append(sentence)
    
    return final_sentences

def extract_key_terms(question):
    """
    Extract key terms, noun phrases, and verb relationships from a question
    """
    # Remove punctuation and convert to lowercase
    cleaned = re.sub(r'[^\w\s]', '', question.lower())
    words = cleaned.split()
    
    # Common stop words to filter out
    stop_words = {
        "a", "an", "the", "this", "that", "these", "those", 
        "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "can", "could",
        "will", "would", "shall", "should", "may", "might",
        "and", "but", "or", "if", "because", "as", "until", "while",
        "of", "at", "by", "for", "with", "about", "against", "between",
        "into", "through", "during", "before", "after", "above", "below",
        "to", "from", "up", "down", "in", "out", "on", "off", "over", "under"
    }
    
    # Keep question words for relationship extraction
    question_words = {"who", "what", "where", "when", "why", "how"}
    
    # Filter out stop words (but keep question words)
    key_terms = [word for word in words if (word not in stop_words or word in question_words) and len(word) > 1]
    
    # Identify subject, action, and object in the question
    subject = None
    action = None
    object_term = None
    
    # Extract relationship patterns
    if "how" in key_terms:
        how_index = key_terms.index("how")
        if how_index + 2 < len(key_terms):
            # Pattern: "How does/might X affect Y"
            if key_terms[how_index+1] in ["does", "do", "might", "can", "could", "will"]:
                if how_index + 3 < len(key_terms):
                    subject = key_terms[how_index+2]
                    action = key_terms[how_index+3]
                    # Get object if it exists
                    if how_index + 4 < len(key_terms):
                        object_term = " ".join(key_terms[how_index+4:])
    
    # Extract noun phrases (consecutive non-stop words)
    noun_phrases = []
    current_phrase = []
    for word in words:
        if word not in stop_words and len(word) > 1:
            current_phrase.append(word)
        elif current_phrase:
            if len(current_phrase) > 1:  # Only consider phrases with 2+ words
                noun_phrases.append(" ".join(current_phrase))
            current_phrase = []
    
    # Add the last phrase if it exists
    if len(current_phrase) > 1:
        noun_phrases.append(" ".join(current_phrase))
    
    # Return extracted information
    return {
        "key_terms": set(key_terms),
        "noun_phrases": set(noun_phrases),
        "relationship": {
            "subject": subject,
            "action": action,
            "object": object_term
        }
    }

def create_chunks(sentences, chunk_size, chunk_overlap):
    """Create overlapping chunks from sentences"""
    chunks = []
    for i in range(0, max(1, len(sentences) - chunk_size + 1), max(1, chunk_size - chunk_overlap)):
        end_idx = min(i + chunk_size, len(sentences))
        chunk_text = " ".join(sentences[i:end_idx])
        chunk_info = {
            "text": chunk_text,
            "start_idx": i,
            "end_idx": end_idx - 1,  # Inclusive end index
            "sentences": sentences[i:end_idx],
            "sentence_indices": list(range(i, end_idx))
        }
        chunks.append(chunk_info)
    
    # Handle the last chunk if needed
    if len(sentences) > 0 and (not chunks or chunks[-1]["end_idx"] < len(sentences) - 1):
        start_idx = max(0, len(sentences) - chunk_size)
        chunk_text = " ".join(sentences[start_idx:])
        chunk_info = {
            "text": chunk_text,
            "start_idx": start_idx,
            "end_idx": len(sentences) - 1,
            "sentences": sentences[start_idx:],
            "sentence_indices": list(range(start_idx, len(sentences)))
        }
        chunks.append(chunk_info)
    
    return chunks

def score_relevance(question, sentences, extracted_info, reranker=None):
    """
    Score each sentence's relevance to the question with precision focus
    
    Args:
        question: The original question
        sentences: List of sentences to score
        extracted_info: Dictionary with key terms, noun phrases, and relationship
        reranker: Optional cross-encoder for more accurate scoring
        
    Returns:
        List of (index, score) tuples sorted by score
    """
    if not sentences:
        return []
    
    # Use cross-encoder if available (more accurate)
    if reranker:
        pairs = [(question, sent) for sent in sentences]
        scores = reranker.predict(pairs)
        
        # Create (index, score) pairs
        scored_sentences = [(i, float(score)) for i, score in enumerate(scores)]
        # Sort by score (descending)
        scored_sentences.sort(key=lambda x: x[1], reverse=True)
        return scored_sentences
    
    # Fallback to embedding-based scoring
    question_embedding = embedding_model.encode(question, convert_to_tensor=True)
    sentence_embeddings = embedding_model.encode(sentences, convert_to_tensor=True)
    
    # Calculate semantic similarity scores
    semantic_scores = torch.nn.functional.cosine_similarity(
        question_embedding.unsqueeze(0),
        sentence_embeddings
    ).numpy()
    
    # Calculate term-based relevance scores
    term_scores = np.zeros(len(sentences))
    phrase_scores = np.zeros(len(sentences))
    relationship_scores = np.zeros(len(sentences))
    
    key_terms = extracted_info["key_terms"]
    noun_phrases = extracted_info["noun_phrases"]
    relationship = extracted_info["relationship"]
    
    for i, sent in enumerate(sentences):
        sent_lower = sent.lower()
        
        # Score for individual key terms
        term_matches = sum(1 for term in key_terms if term in sent_lower)
        if key_terms:
            term_scores[i] = term_matches / len(key_terms)
        
        # Score for noun phrases (exact phrase matches)
        phrase_matches = sum(1 for phrase in noun_phrases if phrase in sent_lower)
        if noun_phrases:
            phrase_scores[i] = phrase_matches / len(noun_phrases)
        
        # Score for relationship match (subject-action-object)
        if relationship["subject"] and relationship["action"]:
            # Check if both subject and action are present
            if relationship["subject"] in sent_lower and relationship["action"] in sent_lower:
                relationship_scores[i] = 0.5
                # Give bonus points if the object is also present
                if relationship["object"] and relationship["object"] in sent_lower:
                    relationship_scores[i] = 1.0
    
    # Combine scores with weights emphasizing relationship matches
    combined_scores = (
        0.3 * semantic_scores + 
        0.1 * term_scores + 
        0.2 * phrase_scores + 
        0.4 * relationship_scores  # Major weight on finding the right relationship
    )
    
    # Create (index, score) pairs
    scored_sentences = [(i, float(score)) for i, score in enumerate(combined_scores)]
    # Sort by score (descending)
    scored_sentences.sort(key=lambda x: x[1], reverse=True)
    return scored_sentences

@app.post("/api/query")
async def process_query(request: QuestionRequest):
    try:
        # Extract key information from the question
        extracted_info = extract_key_terms(request.question)
        
        # Split context into sentences using improved segmentation
        sentences = segment_sentences(request.context)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if not sentences:
            return {
                "answer": "No content to analyze.",
                "confidence": 0.0,
                "highlights": [],
                "merged_highlights": []
            }
        
        # Create overlapping chunks of sentences
        chunks = create_chunks(
            sentences, 
            request.chunk_size, 
            request.chunk_overlap
        )
        
        if not chunks:
            return {
                "answer": "Failed to create chunks from content.",
                "confidence": 0.0,
                "highlights": [],
                "merged_highlights": []
            }
        
        # STAGE 1: Score each chunk's relevance using hybrid approach
        chunk_scores = []
        for i, chunk in enumerate(chunks):
            # Use reranker for more accurate relevance scoring if available
            if reranker_model:
                score = reranker_model.predict([(request.question, chunk["text"])])[0]
            else:
                # Fallback to embedding similarity
                question_embedding = embedding_model.encode(request.question, convert_to_tensor=True)
                chunk_embedding = embedding_model.encode(chunk["text"], convert_to_tensor=True)
                score = torch.nn.functional.cosine_similarity(
                    question_embedding.unsqueeze(0),
                    chunk_embedding.unsqueeze(0)
                ).item()
            
            chunk_scores.append((i, float(score)))
        
        # Sort chunks by score (descending)
        chunk_scores.sort(key=lambda x: x[1], reverse=True)
        
        # STAGE 2: Get candidate sentences from top chunks
        candidate_sentences = []
        chunk_indices = [idx for idx, _ in chunk_scores[:request.top_k_final]]
        
        for idx in chunk_indices:
            chunk = chunks[idx]
            for sentence_idx in chunk["sentence_indices"]:
                if sentence_idx < len(sentences):
                    # Only add unique sentences
                    if sentences[sentence_idx] not in candidate_sentences:
                        candidate_sentences.append(sentences[sentence_idx])
        
        # STAGE 3: Score individual sentences with precision focus
        scored_sentences = score_relevance(
            request.question, 
            candidate_sentences, 
            extracted_info,
            reranker_model
        )
        
        # Only keep sentences above the threshold
        filtered_scores = [(i, score) for i, score in scored_sentences if score >= request.threshold]
        
        # If we have no sentences that meet threshold, use the best one
        if not filtered_scores and scored_sentences:
            filtered_scores = [scored_sentences[0]]
        
        # Check for significant score gap to identify the "definitive" answer
        # This helps select only the sentence(s) that really answer the question
        if len(filtered_scores) > 1:
            # Get the top score
            top_score = filtered_scores[0][1]
            
            # Only keep sentences with scores close to the top score
            filtered_scores = [(i, score) for i, score in filtered_scores 
                              if score >= top_score - request.score_gap_threshold]
        
        # Apply answer strictness filtering - higher strictness means fewer sentences highlighted
        if request.answer_strictness > 0.5 and len(filtered_scores) > 1:
            # Limit the number of sentences based on strictness
            # Higher strictness = fewer sentences
            max_sentences = max(1, int(len(filtered_scores) * (1 - request.answer_strictness)))
            filtered_scores = filtered_scores[:max_sentences]
        
        # Limit to max_highlight_sentences
        filtered_scores = filtered_scores[:request.max_highlight_sentences]
        
        # Prepare highlights
        highlighted_sentences = []
        
        for i, score in filtered_scores:
            if i < len(candidate_sentences):
                sentence_text = candidate_sentences[i]
                # Find the original index in the full text
                try:
                    original_idx = sentences.index(sentence_text)
                    highlighted_sentences.append({
                        "index": original_idx,
                        "text": sentence_text,
                        "score": score
                    })
                except ValueError:
                    # If exact match not found, use fuzzy match
                    for j, sent in enumerate(sentences):
                        if sentence_text in sent:
                            highlighted_sentences.append({
                                "index": j,
                                "text": sent,
                                "score": score
                            })
                            break
        
        # Sort by original position
        highlighted_sentences.sort(key=lambda x: x["index"])
        
        # Merge adjacent sentences for better highlighting
        merged_highlights = merge_adjacent_sentences(highlighted_sentences, sentences)
        
        # Prepare primary answer
        if highlighted_sentences:
            # Use the highest-scoring sentence as the answer
            primary_answer = max(highlighted_sentences, key=lambda x: x["score"])["text"]
            confidence = min(float(max(s["score"] for s in highlighted_sentences) * 100), 100.0)
        else:
            primary_answer = "No relevant content found."
            confidence = 0.0
        
        return {
            "answer": primary_answer,
            "confidence": confidence,
            "highlights": highlighted_sentences,
            "merged_highlights": merged_highlights
        }
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

def merge_adjacent_sentences(relevant_sentences, all_sentences):
    """Merge adjacent sentences into coherent chunks for highlighting"""
    if not relevant_sentences:
        return []
    
    # Sort by original position
    relevant_sentences.sort(key=lambda x: x["index"])
    
    merged = []
    current_chunk = {
        "start_index": relevant_sentences[0]["index"],
        "end_index": relevant_sentences[0]["index"],
        "sentences": [relevant_sentences[0]],
        "avg_score": relevant_sentences[0]["score"]
    }
    
    for i in range(1, len(relevant_sentences)):
        current = relevant_sentences[i]
        # If this sentence immediately follows the previous one
        if current["index"] == current_chunk["end_index"] + 1:
            # Extend the current chunk
            current_chunk["end_index"] = current["index"]
            current_chunk["sentences"].append(current)
            current_chunk["avg_score"] = sum(s["score"] for s in current_chunk["sentences"]) / len(current_chunk["sentences"])
        else:
            # Finish the current chunk and start a new one
            merged.append(current_chunk)
            current_chunk = {
                "start_index": current["index"],
                "end_index": current["index"],
                "sentences": [current],
                "avg_score": current["score"]
            }
    
    # Add the last chunk
    merged.append(current_chunk)
    
    # Create the full text for each merged chunk
    for chunk in merged:
        chunk_text = " ".join(all_sentences[i] for i in range(chunk["start_index"], chunk["end_index"] + 1))
        chunk["text"] = chunk_text
    
    return merged

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "models": {
        "embedding": EMBEDDING_MODEL_PATH,
        "reranker": RERANKER_MODEL_PATH if reranker_model else "disabled"
    }}

@app.get("/")
async def root():
    return {"message": "High-Precision Transcript Highlighter Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)