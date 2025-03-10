from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  

@app.route('/summarize', methods=['POST'])
def summarize():
    """
    API endpoint for generating summaries.
    """
    data = request.get_json()
    
    # Validate input
    if not data or 'text' not in data:
        return jsonify({'error': 'Missing required field: text'}), 400
    
    text = data['text']

    try:
        # Placeholder for actual summarization logic
        summary = f"Summary of: {text[:50]}..."  # Truncate to simulate processing

        return jsonify({
            'message': 'Summarization successful',
            'summary': summary,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
