from pydantic import BaseModel


class UploadResponse(BaseModel):
    attachment_filename: str
    attachment_path: str
    attachment_mime_type: str
    attachment_size: int
