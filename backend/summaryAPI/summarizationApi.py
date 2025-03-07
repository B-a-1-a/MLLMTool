from flask import Flask, request, jsonify
from flask_cors import CORS
from scrape_github import scrape_repo
from generate_readme import generate_readme
import os

app = Flask(__name__)
CORS(app)  

@app.route('/summarize, methods=['POST'])
def generate_readme_api():
    """
    API endpoint for generarting Summary
    """
    data = request.get_json()
    
    # Validate input
    if not data or 'repo_url' not in data:
        return jsonify({'error': 'Missing required field: repo_url'}), 400
    
    repo_url = data['repo_url']
    additional_context = data.get('additional_context', None)
    mode = data.get('mode',"default")

    try:
        # Scrape repository data
        repo_details, repo_contents = scrape_repo(repo_url)
        if not repo_details or not repo_contents:
            return jsonify({'error': 'Failed to fetch repository data'}), 500

        # Generate README
        readme_content = generate_readme(repo_details, repo_contents, additional_context, mode)
        if not readme_content:
            return jsonify({'error': 'Failed to generate README'}), 500
        """
        
        # Save README file
        filename = "README.md"
        script_dir = os.path.dirname(os.path.abspath(__file__))
        readme_path = os.path.join(script_dir, filename)
        
        with open(readme_path, 'w') as file:
            file.write(readme_content)
        """
        
        return jsonify({
            'message': 'README generated successfully',
            'readme': readme_content,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=800, debug=True)