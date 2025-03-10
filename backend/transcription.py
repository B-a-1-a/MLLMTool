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


# Set Google Cloud credentials
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "mllm-transcription-translation-6c6539ea3f3c.json"

load_dotenv()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY"),
)

app = Flask(__name__)
CORS(app)

CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1 if sys.platform == 'darwin' else 2
RATE = 44100

# Directory to save the audio files
SAVE_DIRECTORY = "saved_audio_files"
os.makedirs(SAVE_DIRECTORY, exist_ok=True)

# Globals for PyAudio and recording frames
p = None
stream = None
frames = []
recording_active = False
recording_thread = None


def record_audio():
    global frames, recording_active, stream
    frames = []

    # Continue to record while recording_active is True
    while recording_active:
        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        #use the body of the request to get the audio file
        audio_file = request.files['blobURL']

        #save the audio file 

        #transcribe the audio file
        transcript = transcribe_groq(os.path.join(SAVE_DIRECTORY, audio_file.filename))


    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/start-recording', methods=['GET'])
def start_recording():
    global p, stream, recording_active, recording_thread

    # Initialize PyAudio and start the stream
    p = pyaudio.PyAudio()
    stream = p.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)

    # Set the recording flag and start the recording thread
    recording_active = True
    recording_thread = threading.Thread(target=record_audio)
    recording_thread.start()
    print("Recording started...")

    return jsonify({"message": "Recording started"})

@app.route('/stop-recording', methods=['GET'])
def stop_recording():
    global p, stream, frames, recording_active, recording_thread
    output_filename = os.path.join(SAVE_DIRECTORY, 'test_output.wav')

    # Stop the recording
    recording_active = False
    if recording_thread:
        recording_thread.join()  # Wait for the recording thread to finish

    # Stop and close the PyAudio stream
    stream.stop_stream()
    stream.close()
    p.terminate()

    # Save the recorded audio
    with wave.open(output_filename, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(p.get_sample_size(FORMAT))
        wf.setframerate(RATE)
        wf.writeframes(b''.join(frames))

    print("Recording stopped and saved.")

    # Increase audio volume
    #print("Increasing audio volume")
    #audio = AudioSegment.from_wav(output_filename)
    #audio = audio + 20  # Increase volume by 10 dB
    #audio.export(output_filename.replace(".wav", "_increased_volume.wav"), format="wav")
    #print(output_filename)

    # Transcribe the audio
    #transcribe_audio(output_filename)
    trancription = transcribe_groq(output_filename)
    #if trancription is empty
    if not trancription:
        trancription = translation_whisper(output_filename)

    #return jsonify({"message": "Recording stopped and saved", "file_path": output_filename})
    return jsonify({"transcription": trancription })

def transcribe_audio(file_name):
    print("Transcribing audio...")

    # Instantiate a client for Google Cloud Storage
    storage_client = storage.Client()
    bucket_name = 'text-to-speech-bucket-mllm'
    bucket = storage_client.bucket(bucket_name)

    # Define the blob name and upload the file
    blob_name = os.path.join("audio-files", os.path.basename(file_name))
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(file_name)
    gcs_uri = f"gs://{bucket_name}/{blob_name}"

    # Instantiate a client for Google Speech
    client = speech.SpeechClient()
    audio = speech.RecognitionAudio(uri=gcs_uri)

    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=RATE,  # Ensure this matches your recording rate
        language_code="en-US",
        alternative_language_codes=["es"]
    )

    # Detect speech in the audio file (long-running operation)
    operation = client.long_running_recognize(config=config, audio=audio)
    print("Waiting for transcription to complete...")


    response = operation.result(timeout=500)  # Adjust timeout as needed

    # Process the transcription
    transcript_text = ""
    for result in response.results:
        if result.alternatives:
            transcript_text += result.alternatives[0].transcript + "\n"

    # Save the transcript
    transcript_filename = os.path.splitext(os.path.basename(file_name))[0] + "_transcript.txt"
    with open(transcript_filename, "w") as f:
        f.write(transcript_text)

    print("Transcription completed and saved as", transcript_filename)

    # Translate the transcription to English and Spanish
    #translate_and_save(transcript_text, file_name)

def translate_and_save(text, file_name):
    print("Translating transcription...")
    translated_text_en = translate_text(text, target_language="en")
    translated_text_es = translate_text(text, target_language="es")

    # Save the translations
    english_translation_filename = os.path.splitext(os.path.basename(file_name))[0] + "_translation_english.txt"
    with open(english_translation_filename, "w") as f:
        f.write(translated_text_en)

    spanish_translation_filename = os.path.splitext(os.path.basename(file_name))[0] + "_translation_spanish.txt"
    with open(spanish_translation_filename, "w") as f:
        f.write(translated_text_es)

    print("Translation completed.")

def translate_text(text, target_language):
    # Instantiate a client for Google Cloud Translation
    translate_client = translate.TranslationServiceClient()

    # Set up the request with the project ID and text to be translated
    parent = "projects/mllm-transcription-translation/locations/global"
    response = translate_client.translate_text(
        request={
            "parent": parent,
            "contents": [text],
            "mime_type": "text/plain",
            "target_language_code": target_language,
        }
    )

    # Return the translated text
    return response.translations[0].translated_text

BASE_DIR = os.path.dirname(__file__)

@app.route('/test_output_transcript.txt')
def get_transcript():
    file_path = os.path.join(BASE_DIR, "test_output_transcript.txt")
    with open(file_path, 'r') as file:
        transcript = file.read()
    return transcript

@app.route('/english-translation')
def get_translation_english():
    file_path = os.path.join(BASE_DIR, "whisper_transcript_multilang_translation_english.txt")
    with open(file_path, 'r') as file:
        eng_transcript = file.read()
    return eng_transcript

@app.route('/spanish-translation')
def get_translation_spanish():
    es_file_path = os.path.join(BASE_DIR, "whisper_transcript_multilang_translation_spanish.txt")
    with open(es_file_path, 'r') as file:
        es_transcript = file.read()
    return es_transcript

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

    print("Whisper transcription for multilingual content completed and saved as", whisper_transcript_filename)

    translate_and_save(full_transcription, whisper_transcript_filename)

    return full_transcription
