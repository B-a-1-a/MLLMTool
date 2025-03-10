from flask import Flask, jsonify, send_from_directory, current_app
from flask import request
from flask_cors import CORS
import wave
import os
import pyaudio
from google.cloud import speech, storage, translate
import sys
import threading
from pydub import AudioSegment
import whisper
from groq import Groq
from dotenv import load_dotenv


print("Starting transcription API...")

load_dotenv()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY"),
)

app = Flask(__name__)
CORS(app)

# Directory to save the audio files
SAVE_DIRECTORY = "saved_audio_files"
os.makedirs(SAVE_DIRECTORY, exist_ok=True)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    print("Recieved request to transcribe audio...")
    
    try:
        # Get the audio file from the form-data (file upload)
        audio_file = request.files.get('file')

        if not audio_file:
            return jsonify({"error": "No audio file provided"}), 400


        # Save the audio file
        audio_file_path = os.path.join("saved_audio_files", audio_file.filename)
        audio_file.save(audio_file_path)

        trancription = transcribe_groq(audio_file_path)
        #if trancription is empty
        if not trancription:
            trancription = translation_whisper(audio_file_path)

        #transcribe the audio file
        transcription = transcribe_groq(os.path.join(SAVE_DIRECTORY, audio_file.filename))

        print("Transcription Result:", transcription)

        return jsonify({"transcript": transcription}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def transcribe_groq(filename):
    print("Transcribing with Groq...")
    with open(filename, "rb") as file:
        # Create a transcription of the audio file
        transcription = client.audio.transcriptions.create(
        file=(filename, file.read()), # Required audio file
        model="whisper-large-v3-turbo", # Required model to use for transcription
        #prompt="Two languages coming in, code-switching between english and spanish, return it in both spanish and english",
        prompt="Two languages coming in, code-switching between english and spanish, transcribe the audio as is, returning spanish when they are speaking spanish and english when they are speaking english",
        response_format="json",  # Optional
        #language="None" - didn't work
        )
        # Print the transcription text
        print(transcription.text)

        return transcription.text
        

def translation_whisper(output_filename):
    print("Translating with Whisper...")
    # Ensure the output file path is correct and matches the processed audio file
    #processed_filename = os.path.join(SAVE_DIRECTORY, 'test_output_increased_volume.wav')
    processed_filename = output_filename

    # Load the Whisper model
    model = whisper.load_model("large")  # Use 'base' or another model variant as needed

    # Load the audio file
    audio = AudioSegment.from_file(processed_filename, format="wav")

    # Split audio into 30-second chunks
    seconds = 30
    chunk_duration = seconds * 1000  # 30 seconds in milliseconds
    chunks = [audio[i:i + chunk_duration] for i in range(0, len(audio), chunk_duration)]

    all_transcriptions = []

    for idx, chunk in enumerate(chunks):
        print(f"Processing chunk {idx + 1}/{len(chunks)}...")

        # Save the chunk to a temporary file
        temp_chunk_path = os.path.join(SAVE_DIRECTORY, f"temp_chunk_{idx}.wav")
        chunk.export(temp_chunk_path, format="wav")

        result = model.transcribe(
            temp_chunk_path,
            language=None,  # Allow automatic language detection
            task="transcribe",
            initial_prompt="Two languages coming in, code-switching between english and spanish"
        )
        print("Transcription for chunk", idx + 1, ":", result["text"])
        # Append the transcription and translation
        all_transcriptions.append(result["text"])

    # Combine all transcriptions
    full_transcription = "".join(all_transcriptions)

    # Save the full transcription
    whisper_transcript_filename = "whisper_transcript_multilang.txt"
    with open(whisper_transcript_filename, "w") as f:
        f.write(full_transcription)


    return full_transcription
