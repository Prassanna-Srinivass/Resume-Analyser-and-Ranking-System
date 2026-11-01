from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
from time import perf_counter
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from . import database as store, llm
from .schemas import Prompt, Template, RunRequest, Rating


def now():
    return datetime.now(timezone.utc).isoformat()

def get_one(table, item_id):
    with store.connection() as db:
        row = db.execute(f'SELECT * FROM {table} WHERE id=?', (item_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Record not found')
    return dict(row)

def insert(table, values):
    with store.connection() as db:
        keys = ','.join(values)
        cursor = db.execute(f'INSERT INTO {table} ({keys}) VALUES ({",".join("?" for _ in values)})', tuple(values.values()))
        item_id = cursor.lastrowid
    return get_one(table, item_id)

def update(table, item_id, values):
    with store.connection() as db:
        cursor = db.execute(f'UPDATE {table} SET {",".join(k+"=?" for k in values)} WHERE id=?', (*values.values(), item_id))
        if cursor.rowcount == 0:
            raise HTTPException(404, 'Record not found')
    return get_one(table, item_id)

@asynccontextmanager
async def lifespan(app):
    store.initialize()
    yield

app = FastAPI(title='Prompt Engineering Playground', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','), allow_methods=['GET','POST','PUT','DELETE'], allow_headers=['Content-Type'])

@app.get('/api/health')
def health():
    return {'status': 'ok'}

@app.get('/api/config')
def config():
    return {'models': llm.models(), 'techniques': llm.TECHNIQUES, 'single_user': True}

@app.get('/api/dashboard')
def dashboard():
    with store.connection() as db:
        counts = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in ('prompts','runs','templates')}
        counts['rated_runs'] = db.execute('SELECT COUNT(*) FROM runs WHERE relevance_rating IS NOT NULL').fetchone()[0]
    return counts

@app.post('/api/prompts', status_code=201)
def create_prompt(data: Prompt):
    return insert('prompts', {**data.model_dump(), 'created_at': now(), 'updated_at': now()})

@app.get('/api/prompts')
def list_prompts(q: str = Query('', max_length=200)):
    with store.connection() as db:
        return [dict(r) for r in db.execute('SELECT * FROM prompts WHERE instr(lower(title || prompt_text || category),lower(?)) > 0 ORDER BY id DESC', (q,))]

@app.get('/api/prompts/{item_id}')
def read_prompt(item_id: int):
    return get_one('prompts', item_id)

@app.put('/api/prompts/{item_id}')
def update_prompt(item_id: int, data: Prompt):
    return update('prompts', item_id, {**data.model_dump(), 'updated_at': now()})

@app.post('/api/prompts/{item_id}/run', status_code=201)
async def run_prompt(item_id: int, data: RunRequest):
    prompt = get_one('prompts', item_id)
    started = perf_counter()
    answer, rendered, demo = await llm.generate(prompt, data.model_name, data.input_text)
    # Immutable prompt snapshot: later edits cannot change previous experiment evidence.
    return insert('runs', {k: prompt[k] for k in ('title','prompt_text','technique','category')} | {
        'prompt_id': item_id if prompt_exists(item_id) else None,
        'model_name': data.model_name, 'input_text': data.input_text,
        'response_text': answer, 'rendered_prompt': rendered, 'is_demo': int(demo),
        'latency_ms': round((perf_counter()-started)*1000), 'created_at': now()})

def prompt_exists(item_id):
    with store.connection() as db:
        return db.execute('SELECT id FROM prompts WHERE id=?', (item_id,)).fetchone() is not None

@app.get('/api/runs')
def list_runs(q: str = Query('', max_length=200), technique: str = ''):
    with store.connection() as db:
        return [dict(r) for r in db.execute('SELECT * FROM runs WHERE instr(lower(title || prompt_text || response_text),lower(?))>0 AND (?="" OR technique=?) ORDER BY id DESC', (q,technique,technique))]

@app.get('/api/runs/{item_id}')
def read_run(item_id: int):
    return get_one('runs', item_id)

@app.post('/api/runs/{item_id}/rating')
def rate_run(item_id: int, data: Rating):
    return update('runs', item_id, data.model_dump())

@app.get('/api/templates')
def list_templates(q: str = Query('', max_length=200)):
    with store.connection() as db:
        return [dict(r) for r in db.execute('SELECT * FROM templates WHERE instr(lower(title || template_text || category),lower(?))>0 ORDER BY id DESC', (q,))]

@app.post('/api/templates', status_code=201)
def create_template(data: Template):
    return insert('templates', {**data.model_dump(), 'created_at': now(), 'updated_at': now()})

@app.put('/api/templates/{item_id}')
def update_template(item_id: int, data: Template):
    return update('templates', item_id, {**data.model_dump(), 'updated_at': now()})

# Fixed table names, never request-supplied SQL identifiers.
def delete_record(table, item_id):
    with store.connection() as db:
        cursor = db.execute(f'DELETE FROM {table} WHERE id=?', (item_id,))
        if cursor.rowcount == 0:
            raise HTTPException(404, 'Record not found')
    return Response(status_code=204)

@app.delete('/api/prompts/{item_id}', status_code=204)
def delete_prompt(item_id: int):
    return delete_record('prompts', item_id)

@app.delete('/api/runs/{item_id}', status_code=204)
def delete_run(item_id: int):
    return delete_record('runs', item_id)

@app.delete('/api/templates/{item_id}', status_code=204)
def delete_template(item_id: int):
    return delete_record('templates', item_id)

# Production build and API share one origin. API routes must be registered first.
build = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if build.is_dir():
    app.mount('/', StaticFiles(directory=build, html=True), name='frontend')
