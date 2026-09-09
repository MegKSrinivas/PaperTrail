import os
import uuid
import tempfile
import boto3
from dotenv import load_dotenv

load_dotenv()

_s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
    region_name="auto",
)

_BUCKET = os.getenv("R2_BUCKET_NAME", "papertrail-pdfs")


def upload_bytes(data: bytes, filename: str = None) -> str:
    key = f"{uuid.uuid4()}/{filename or 'file.pdf'}"
    _s3.put_object(Bucket=_BUCKET, Key=key, Body=data, ContentType="application/pdf")
    return key


def download_to_tempfile(key: str) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    _s3.download_fileobj(_BUCKET, key, tmp)
    tmp.close()
    return tmp.name


def delete(key: str) -> None:
    _s3.delete_object(Bucket=_BUCKET, Key=key)
