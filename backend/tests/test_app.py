import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient
from app import database, llm
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', str(tmp_path / 'test.db'))
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    with TestClient(app) as client:
        yield client

DATA = {'title':'Explain AI','prompt_text':'Explain AI simply.','technique':'zero-shot','category':'Learning'}

def create(client, **overrides):
    response = client.post('/api/prompts', json=DATA | overrides)
    assert response.status_code == 201
    return response.json()

def test_full_workflow_and_immutable_snapshots(client):
    prompt = create(client)
    first = client.post(f"/api/prompts/{prompt['id']}/run", json={'model_name':'demo-local','input_text':'For a student'}).json()
    assert first['is_demo'] and 'DEMO SIMULATION' in first['response_text']
    assert 'For a student' in first['rendered_prompt']
    changed = DATA | {'prompt_text':'Now explain databases.'}
    assert client.put(f"/api/prompts/{prompt['id']}", json=changed).status_code == 200
    second = client.post(f"/api/prompts/{prompt['id']}/run", json={'model_name':'demo-local'}).json()
    assert second['prompt_text'] == changed['prompt_text']
    assert client.get(f"/api/runs/{first['id']}").json()['prompt_text'] == DATA['prompt_text']
    assert len(client.get('/api/runs').json()) == 2
    rating = {'relevance_rating':4,'clarity_rating':3,'completeness_rating':5,'feedback_note':'Useful'}
    assert client.post(f"/api/runs/{first['id']}/rating", json=rating).json()['feedback_note'] == 'Useful'
    assert client.get('/api/dashboard').json()['rated_runs'] == 1
    assert client.delete(f"/api/prompts/{prompt['id']}").status_code == 204
    assert client.get(f"/api/runs/{first['id']}").json()['prompt_id'] is None
    assert client.delete(f"/api/runs/{first['id']}").status_code == 204
    assert client.get(f"/api/runs/{first['id']}").status_code == 404

@pytest.mark.parametrize('overrides',[{'title':' '},{'prompt_text':''},{'technique':'invalid'},{'prompt_text':'x'*20001},{'unknown':True}])
def test_prompt_validation(client, overrides):
    assert client.post('/api/prompts', json=DATA | overrides).status_code == 422

def test_rating_bounds_and_missing_records(client):
    assert client.post('/api/runs/1/rating', json={'relevance_rating':6,'clarity_rating':3,'completeness_rating':1}).status_code == 422
    assert client.post('/api/runs/1/rating', json={'relevance_rating':True,'clarity_rating':3,'completeness_rating':1}).status_code == 422
    for path in ['/api/prompts/999','/api/runs/999']:
        assert client.get(path).status_code == 404
        assert client.delete(path).status_code == 404
    assert client.put('/api/templates/999', json={'title':'t','template_text':'x'}).status_code == 404

@pytest.mark.parametrize('technique',list(llm.TECHNIQUES))
def test_techniques_and_search(client, technique):
    prompt = create(client, technique=technique)
    run = client.post(f"/api/prompts/{prompt['id']}/run", json={'model_name':'demo-local'}).json()
    assert run['rendered_prompt'].startswith(llm.TECHNIQUES[technique])
    if technique=='structured-output':
        import json
        assert 'answer' in json.loads(run['response_text'])
    assert len(client.get('/api/runs', params={'q':'explain','technique':technique}).json()) == 1
    assert client.get('/api/prompts',params={'q':"' OR 1=1--"}).json()==[]

def test_templates(client):
    data = {'title':'Editor','template_text':'Rewrite this','category':'Writing','technique':'role-based'}
    t = client.post('/api/templates',json=data).json()
    assert client.get('/api/templates').json()[0]['template_text']=='Rewrite this'
    assert client.put(f"/api/templates/{t['id']}",json=data|{'title':'New title'}).json()['title']=='New title'
    assert client.delete(f"/api/templates/{t['id']}").status_code==204
    assert client.get('/api/templates').json()==[]

def test_provider_error_does_not_create_run(client, monkeypatch):
    async def failed(*args):
        from fastapi import HTTPException
        raise HTTPException(504,'Provider timed out')
    monkeypatch.setattr(llm,'generate',failed)
    prompt=create(client)
    assert client.post(f"/api/prompts/{prompt['id']}/run",json={'model_name':'demo-local'}).status_code==504
    assert client.get('/api/runs').json()==[]

def test_models_and_secret_redaction(client, monkeypatch):
    monkeypatch.setenv('LLM_API_KEY','test-secret-do-not-return')
    monkeypatch.setenv('LLM_MODEL','test-model')
    monkeypatch.setenv('LLM_MODELS','')
    config=client.get('/api/config')
    assert config.json()['models']==['demo-local','test-model']
    assert 'test-secret' not in config.text
    p=create(client)
    assert client.post(f"/api/prompts/{p['id']}/run",json={'model_name':'unconfigured'}).status_code==422

@pytest.mark.parametrize('case,expected',[('success',None),('rate-limit',429),('credentials',502),('server',502),('malformed',502),('empty',502),('timeout',504),('network',502)])
def test_real_provider_adapter(monkeypatch,case,expected):
    monkeypatch.setenv('LLM_API_KEY','test-key')
    monkeypatch.setenv('LLM_MODEL','test-model')
    monkeypatch.setenv('LLM_MODELS','')
    original=httpx.AsyncClient
    def handler(request):
        assert request.headers['authorization']=='Bearer test-key'
        import json
        payload=json.loads(request.content)
        assert payload['model']=='test-model' and DATA['prompt_text'] in payload['messages'][0]['content']
        if case=='timeout': raise httpx.ReadTimeout('private details')
        if case=='network': raise httpx.ConnectError('private details')
        if case=='rate-limit': return httpx.Response(429,text='private details')
        if case=='credentials': return httpx.Response(401,text='test-key')
        if case=='server': return httpx.Response(500,text='private details')
        if case=='malformed': return httpx.Response(200,json={'unexpected':True})
        return httpx.Response(200,json={'choices':[{'message':{'content':'Answer' if case=='success' else ''}}]})
    monkeypatch.setattr(llm.httpx,'AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    if expected:
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc: asyncio.run(llm.generate(DATA,'test-model','Context'))
        assert exc.value.status_code==expected
        assert 'private details' not in exc.value.detail and 'test-key' not in exc.value.detail
    else:
        answer,rendered,demo=asyncio.run(llm.generate(DATA,'test-model','Context'))
        assert answer=='Answer' and not demo and 'Context' in rendered
