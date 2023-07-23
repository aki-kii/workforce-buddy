import logging
import os
from typing import Optional

import boto3
import requests
from slack_sdk import WebClient
from slack_sdk.web.slack_response import SlackResponse

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

s3 = boto3.client("s3")


# カスタムエラーを定義
class WorkforceBuddyException(Exception):
    pass


def lambda_handler(event: dict, context: dict) -> dict:
    """
    Lambda関数ハンドラ

    Args:
        event (dict)
        context (dict)

    Returns:
        dict: レスポンス
    """
    try:
        logger.info(f"event: {event}")
        res: dict = logic(event)

    except Exception as err:
        logger.error(f"想定外のエラーが発生しました\n{err}")
        raise WorkforceBuddyException

    return res


def logic(event: dict) -> dict:
    """
    メインロジック

    Args:
        event (dict)

    Returns:
        dict: レスポンス
    """
    # 環境情報を取得
    try:
        token: str = os.environ["SLACK_BOT_TOKEN"]
        bucket_name: str = os.environ["BUCKET_NAME"]

    except Exception as err:
        logger.error(f"環境情報の読み出しに失敗しました\n{err}")
        raise WorkforceBuddyException

    # ファイル情報を取得
    file_id: str = event["slack_info"]["file_id"]
    slack: WebClient = WebClient(token=token)
    file_info: Optional[SlackResponse] = None
    try:
        file_info = slack.files_info(token=token, file=file_id)
        logger.info(f"file_info: {file_info}")

    except Exception as err:
        logger.error(f"ファイル情報の取得に失敗しました\n{err}")
        raise WorkforceBuddyException

    # ファイル取得
    file_content: bytes = download_file(file_info, token)

    # ファイル取得失敗
    if not file_content:
        logger.error(f"ファイル情報の取得に失敗しました")
        raise WorkforceBuddyException

    # S3へファイルを格納
    file_name: str = file_info["file"]["name"]
    s3.put_object(
        Bucket=bucket_name, Body=file_content, Key=f"raw/{file_name}"
    )

    # レスポンスを作成
    res = create_response(file_name)
    return res


def download_file(file_info: SlackResponse, token: str) -> bytes:
    """
    Slackにアップロードされたファイルを取得する

    Args:
        file_info (SlackResponse): アップロードされたファイル情報
        token (str): アクセストークン

    Returns:
        bytes: 勤務データ(バイナリ)
    """
    download_url: str = file_info["file"].get("url_private_download")
    if download_url:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response: requests.Response = requests.get(
                download_url, headers=headers
            )
            logger.info(f"response: {response}")
            file_content = response.content

        except Exception as err:
            logger.error(f"ファイル情報の取得に失敗しました\n{err}")
            raise WorkforceBuddyException

    return file_content


def create_response(file_name: str) -> dict:
    """
    レスポンスを作成する

    Args:
        file_name (str): ファイル名

    Returns:
        dict: レスポンス
            file_name (str): ファイル名
    """
    res: dict = {"file_name": file_name}

    return res
