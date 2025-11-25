import os
import re
import fitz  # PyMuPDF
import spacy
from flask import Flask, request
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# --- 1. SETUP ---
# (No changes here)
app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Downloading spaCy model 'en_core_web_sm'...")
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

# --- 2. SKILLS_DB & HELPER FUNCTIONS ---
# (No changes here)
SKILLS_DB = [
    # --- Programming Languages ---
    'python', 'java', 'c++', 'c#', 'javascript', 'typescript', 'php', 'ruby', 'swift', 'kotlin',
    'go', 'rust', 'sql', 'r', 'matlab', 'powershell', 'bash',

    # --- Web Development & Frameworks ---
    'html', 'css', 'react', 'angular', 'vue', 'next.js', 'node.js', 'express.js', 'django',
    'flask', 'ruby on rails', 'asp.net', 'spring boot', 'jquery', 'bootstrap',

    # --- Databases & Data Storage ---
    'mysql', 'postgresql', 'sqlite', 'mongodb', 'redis', 'cassandra', 'microsoft sql server',
    'oracle', 'nosql', 'firebase', 'dynamodb',

    # --- Cloud & DevOps ---
    'aws', 'azure', 'google cloud', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
    'jenkins', 'git', 'github actions', 'circleci', 'vagrant', 'serverless', 'ci/cd',

    # --- Data Science & Machine Learning ---
    'machine learning', 'deep learning', 'data analysis', 'data visualization', 'statistics',
    'natural language processing', 'nlp', 'computer vision', 'tensorflow', 'pytorch',
    'scikit-learn', 'keras', 'pandas', 'numpy', 'scipy', 'matplotlib', 'seaborn',
    'apache spark', 'hadoop',

    # --- Business Intelligence & Data Warehousing ---
    'tableau', 'power bi', 'qlik sense', 'looker', 'etl', 'data warehousing',
    'business intelligence',

    # --- Mechanical & Industrial Engineering ---
    'solidworks', 'autocad', 'catia', 'creo', 'proe', 'revit', 'siemens nx', 'ansys',
    'simulink', 'abaqus', 'labview', 'fea', 'finite element analysis', 'cfd',
    'computational fluid dynamics', 'gdt', 'geometric dimensioning and tolerancing',

    'dfm', 'dfa', 'hvac', 'mep', 'lean manufacturing', 'six sigma', 'bom', 'bill of materials',
    'plm', 'product lifecycle management', 'cnc machining', 'injection molding', '3d printing',
    'robotics', 'mechatronics',

    # --- Project & Product Management ---
    'agile', 'scrum', 'kanban', 'waterfall', 'prince2', 'pmp', 'jira', 'confluence',
    'asana', 'trello', 'ms project', 'product roadmap', 'user stories', 'sprint planning',

    # --- IT & Networking ---
    'tcp/ip', 'dns', 'dhcp', 'vpn', 'firewalls', 'load balancing', 'cybersecurity',
    'cisco', 'juniper', 'active directory', 'wireshark', 'ccna', 'cissp', 'comptia security+',

    # --- Soft Skills (for basic matching) ---
    'leadership', 'communication', 'teamwork', 'problem-solving', 'collaboration',
    'creativity', 'mentorship', 'project management', 'analysis'
]


def extract_text_from_pdf(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        return ""

def preprocess_text(text):
    doc = nlp(text.lower())
    tokens = [token.lemma_ for token in doc if not token.is_stop and not token.is_punct and not token.is_space]
    return " ".join(tokens)

def calculate_similarity_score(resume_text, job_description_text):
    text_corpus = [resume_text, job_description_text]
    vectorizer = TfidfVectorizer()
    try:
        tfidf_matrix = vectorizer.fit_transform(text_corpus)
        return cosine_similarity(tfidf_matrix)[0, 1]
    except ValueError:
        return 0.0

# --- 3. HTML TEMPLATES ---
HTML_INDEX_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Smarter Resume Ranker</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f9; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        textarea, input[type="file"] { width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ddd; box-sizing: border-box; }
        button { display: block; width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }
        button:hover { background-color: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Smarter Resume Ranker</h1>
        <p>This model now combines overall text similarity with specific skill matching for more accurate results.</p>
        <form method="post" enctype="multipart/form-data">
            <div class="form-group">
                <label for="job_description">Job Description</label>
                <textarea name="job_description" id="job_description" rows="10" required placeholder="Paste the job description here..."></textarea>
            </div>
            <div class="form-group">
                <label for="resumes">Upload Resumes (PDFs)</label>
                <input type="file" name="resumes" id="resumes" multiple required>
            </div>
            <button type="submit">Rank Resumes</button>
        </form>
    </div>
</body>
</html>
"""

# ***** CHANGE 1: UPDATE THE RESULTS PAGE GENERATION *****
def generate_results_page(ranked_results):
    table_rows = ""
    for idx, result in enumerate(ranked_results):
        rank = idx + 1
        
        # Format the matched skills for display
        # We'll sort them alphabetically for a clean look
        matched_skills_str = ", ".join(sorted(list(result['matched_skills_set'])))
        if not matched_skills_str:
            matched_skills_str = "None"
            
        table_rows += f"""
        <tr>
            <td>{rank}</td>
            <td>{result['filename']}</td>
            <td><strong>{result['final_score']:.2f}%</strong></td>
            <td>{result['similarity_score']:.2f}%</td>
            <td>{result['skill_score']:.2f}% ({result['skills_matched_count']} / {result['skills_required_count']})</td>
            <td>{matched_skills_str}</td>
        </tr>
        """

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Ranking Results</title>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f4f9; margin: 0; padding: 20px; }}
            .container {{ max-width: 1200px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }}
            h1 {{ color: #333; text-align: center; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
            th, td {{ padding: 12px; border: 1px solid #ddd; text-align: left; vertical-align: top; }}
            th {{ background-color: #007bff; color: white; }}
            tr:nth-child(even) {{ background-color: #f2f2f2; }}
            a {{ display: inline-block; margin-top: 20px; text-decoration: none; padding: 10px 15px; background-color: #28a745; color: white; border-radius: 4px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Ranking Results</h1>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Resume File</th>
                        <th>Final Score</th>
                        <th>Text Similarity</th>
                        <th>Skill Match</th>
                        <th>Matched Skills</th>
                    </tr>
                </thead>
                <tbody>
                    {table_rows}
                </tbody>
            </table>
            <a href="/">Rank More Resumes</a>
        </div>
    </body>
    </html>
    """

# --- 4. FLASK ROUTING ---
@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        job_description = request.form['job_description']
        uploaded_files = request.files.getlist('resumes')
        
        results = []
        
        # Preprocess JD once
        clean_jd = preprocess_text(job_description)
        # Find required skills from JD once
        jd_skills_required = {skill for skill in SKILLS_DB if re.search(r'\b' + re.escape(skill) + r'\b', job_description.lower())}
        
        for file in uploaded_files:
            if file.filename != '' and file.filename.lower().endswith('.pdf'):
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
                file.save(filepath)

                raw_resume_text = extract_text_from_pdf(filepath)
                clean_resume = preprocess_text(raw_resume_text)
                
                similarity_score = calculate_similarity_score(clean_resume, clean_jd)
                
                skills_matched = {skill for skill in jd_skills_required if re.search(r'\b' + re.escape(skill) + r'\b', raw_resume_text.lower())}
                
                skill_score = 0.0
                if jd_skills_required:
                    skill_score = len(skills_matched) / len(jd_skills_required)

                similarity_weight = 0.4 
                skill_weight = 0.6
                final_score = (similarity_weight * similarity_score + skill_weight * skill_score) * 100
                
                # ***** CHANGE 2: UPDATE THE DICTIONARY BEING APPENDED *****
                results.append({
                    'filename': file.filename, 
                    'final_score': final_score,
                    'similarity_score': similarity_score * 100,
                    'skill_score': skill_score * 100,
                    'skills_matched_count': len(skills_matched), # The number of skills
                    'skills_required_count': len(jd_skills_required), # The number of required skills
                    'matched_skills_set': skills_matched # The actual set of matched skills
                })

                os.remove(filepath)
        
        ranked_results = sorted(results, key=lambda x: x['final_score'], reverse=True)
        return generate_results_page(ranked_results)

    return HTML_INDEX_PAGE

# --- 5. RUN THE APP ---
if __name__ == '__main__':
    app.run(debug=True)