import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
import logging
import os
import os # os 모듈 임포트 추가
import json
import asyncio

# Google API 관련 라이브러리
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import speech
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import google.generativeai as genai

# --- 기본 설정 ---
logging.basicConfig(level=logging.INFO)
app = FastAPI()

# 현재 파일(main.py)의 디렉토리 경로를 기준으로 frontend 디렉토리의 절대 경로를 계산
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

# --- 상수 정의 ---
CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'
if not os.path.exists(CREDENTIALS_FILE):
    google_credentials_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
    if google_credentials_json:
        try:
            with open(CREDENTIALS_FILE, 'w') as f:
                f.write(google_credentials_json)
            logging.info("credentials.json created from GOOGLE_CREDENTIALS_JSON environment variable.")
        except Exception as e:
            logging.error(f"Error writing credentials.json from env var: {e}")
    else:
        logging.warning("credentials.json not found and GOOGLE_CREDENTIALS_JSON environment variable is not set.")
SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file'
]

# --- 정적 파일 제공 ---
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

# --- Google API 헬퍼 함수 ---
def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(GoogleAuthRequest())
                with open(TOKEN_FILE, 'w') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logging.error(f"토큰 갱신 실패: {e}")
                return None
        else:
            return None
    return creds

def create_google_doc(creds, title):
    try:
        service = build('docs', 'v1', credentials=creds)
        document = service.documents().create(body={'title': title}).execute()
        logging.info(f"'{title}' 문서 생성 완료. ID: {document.get('documentId')}")
        return document.get('documentId')
    except HttpError as err:
        logging.error(f"Google Docs 생성 오류: {err}")
        return None

def append_to_google_doc(creds, doc_id, text):
    try:
        service = build('docs', 'v1', credentials=creds)
        # 문서의 끝에 텍스트를 추가하도록 수정
        doc = service.documents().get(documentId=doc_id).execute()
        end_index = doc.get('body').get('content')[-1].get('endIndex') - 1
        requests = [
            {
                'insertText': {
                    'location': {'index': end_index},
                    'text': text + '\n'
                }
            }
        ]
        service.documents().batchUpdate(documentId=doc_id, body={'requests': requests}).execute()
    except HttpError as err:
        logging.error(f"Google Docs 내용 추가 오류: {err}")

def get_doc_content(creds, doc_id):
    try:
        service = build('docs', 'v1', credentials=creds)
        doc = service.documents().get(documentId=doc_id, fields='body').execute()
        content = doc.get('body').get('content')
        full_text = ""
        if content:
            for element in content:
                if 'paragraph' in element:
                    for para_element in element.get('paragraph').get('elements'):
                        if 'textRun' in para_element:
                            full_text += para_element.get('textRun').get('content')
        return full_text
    except HttpError as err:
        logging.error(f"Google Docs 내용 읽기 오류: {err}")
        return None

# --- 라우팅 ---
@app.get("/")
async def read_index(): return FileResponse("frontend/index.html")

@app.get("/auth/status")
async def auth_status(): return {"logged_in": get_credentials() is not None}

@app.get("/login")
async def login(request: Request):
    flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=SCOPES, redirect_uri=request.url_for('oauth2callback')._url.replace("http://", "https://", 1))
    authorization_url, _ = flow.authorization_url(access_type='offline', include_granted_scopes='true')
    return RedirectResponse(authorization_url)

@app.get("/oauth2callback")
async def oauth2callback(request: Request):
    try:
        flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=SCOPES, redirect_uri=request.url_for('oauth2callback')._url.replace("http://", "https://", 1))
        flow.fetch_token(authorization_response=str(request.url))
        with open(TOKEN_FILE, 'w') as token_file:
            token_file.write(flow.credentials.to_json())
        return RedirectResponse(url='/')
    except Exception as e:
        logging.error(f"OAuth 콜백 처리 중 오류 발생: {e}")
        raise HTTPException(status_code=500, detail=f"OAuth 콜백 처리 중 오류 발생: {e}")

@app.post("/logout")
async def logout():
    if os.path.exists(TOKEN_FILE): os.remove(TOKEN_FILE)
    return {"status": "logged_out"}

@app.post("/summarize")
async def summarize(request: Request):
    creds = get_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="인증되지 않음")
    
    body = await request.json()
    doc_id = body.get('doc_id')
    summary_format = body.get('summary_format', 'bullet')
    gemini_api_key = body.get('api_key')

    if not gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API 키가 필요합니다.")

    try:
        genai.configure(api_key=gemini_api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 키 설정 오류: {e}")

    if not doc_id:
        raise HTTPException(status_code=400, detail="Document ID가 필요합니다.")

    content = get_doc_content(creds, doc_id)
    if content is None:
        raise HTTPException(status_code=500, detail="문서 내용을 가져올 수 없습니다.")
    if not content.strip():
        return {"summary": "요약할 내용이 없습니다."}

    # The frontend now sends doc_id, so we need to fetch the content from Google Docs
    # The content variable is already fetched above, so no change needed here.

    try:
        model = genai.GenerativeModel('gemini-pro')
        prompt_style = "핵심 내용을箇条書き(불렛 포인트)로 정리해줘."
        if summary_format == 'paragraph':
            prompt_style = "전체 내용을 자연스러운 문단으로 요약해줘."
        
        prompt = f"다음은 회의 또는 대화의 녹취록이야. 이 내용을 바탕으로, {prompt_style}\n\n---\n{content}"
        
        response = await model.generate_content_async(prompt)
        # 마크다운 형식 정리 (예: `*` 제거)
        summary = response.text.replace('* ', '').replace('*', '')
        return {"summary": summary}
    except Exception as e:
        logging.error(f"Gemini API 오류: {e}")
        raise HTTPException(status_code=500, detail=f"요약 생성 중 오류 발생: {e}")

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    # (이전과 동일한 WebSocket 코드)
    await websocket.accept()
    creds = get_credentials()
    if not creds:
        await websocket.close(code=4001, reason="인증되지 않음")
        return

    try:
        config_message = await websocket.receive_json()
        language_code = config_message.get("language", "ko-KR")
        doc_title = config_message.get("docTitle", "새 음성 메모")
        doc_mode = config_message.get("docMode", "new")
        doc_id = config_message.get("docId")

        document_id = None
        if doc_mode == "new":
            document_id = create_google_doc(creds, doc_title)
            if not document_id:
                await websocket.close(code=5000, reason="문서 생성 실패")
                return
            await websocket.send_json({"doc_id": document_id, "type": "doc_created"})
        elif doc_mode == "append":
            if not doc_id:
                await websocket.close(code=4002, reason="기존 문서에 추가하려면 문서 ID가 필요합니다.")
                return
            # Check if the document exists and is accessible (optional but good practice)
            # For simplicity, we'll assume it exists and is accessible for now.
            document_id = doc_id

        client = speech.SpeechAsyncClient(credentials=creds)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code=language_code,
            enable_automatic_punctuation=True,
            model='default',
            use_enhanced=True,
        )
        streaming_config = speech.StreamingRecognitionConfig(config=config, interim_results=True)

        async def audio_stream_generator():
            while True:
                try:
                    yield await websocket.receive_bytes()
                except WebSocketDisconnect:
                    break
        
        requests_gen = (speech.StreamingRecognizeRequest(audio_content=chunk) async for chunk in audio_stream_generator())
        
        responses = await client.streaming_recognize(streaming_config, requests_gen)
        
        async for response in responses:
            for result in response.results:
                if not result.alternatives: continue
                transcript = result.alternatives[0].transcript
                if result.is_final:
                    await websocket.send_json({"type": "transcript", "text": transcript, "is_final": True})
                    if transcript.strip():
                        append_to_google_doc(creds, document_id, transcript)
                else:
                    await websocket.send_json({"type": "transcript", "text": transcript, "is_final": False})

    except WebSocketDisconnect:
        logging.info("WebSocket 연결이 정상적으로 끊어졌습니다.")
    except Exception as e:
        logging.error(f"WebSocket 처리 중 오류 발생: {e}")
        await websocket.close(code=1011, reason=f"서버 오류: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)