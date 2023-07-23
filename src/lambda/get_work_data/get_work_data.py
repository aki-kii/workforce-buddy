import json
import logging
import os
from typing import Optional

import boto3
import requests
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from slack_sdk.web.slack_response import SlackResponse

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# 正常終了
NORMAL_RESULT: str = "0000"
# 想定外が発生
ERROR_RESULT: str = "9999"

s3 = boto3.client("s3")


# カスタムエラーを定義
class WorkforceBuddyException(Exception):
    pass


def lambda_handler(event: dict, context: dict) -> dict:
    """
    Lambdaハンドラー

    param
    -----------
    event: dict
    context: dict
    """
    try:
        logger.info(f"event: {event}")
        body: dict = json.loads(event["body"])
        logger.info(f"body: {body}")
        res: dict = logic(body)

    except Exception as err:
        logger.error(f"想定外のエラーが発生しました\n{err}")
        res = create_response(NORMAL_RESULT)

    return res


def logic(body: dict) -> dict:
    """
    メインロジック

    params
    ------
    body: dict
        SlackAPIからのリクエストボディ

    return
    ------
    dict
        API Gatewayへ返すレスポンス
    """
    # SlackAPIの認証リクエストを判定
    if body["type"] == "url_verification":
        challenge: str = body["challenge"]
        res: dict = create_response(NORMAL_RESULT, challenge=challenge)
        logger.info("チャンレンジ認証チェックOK")
        return res

    # 環境情報を取得
    try:
        token: str = os.environ["SLACK_BOT_TOKEN"]
        bot_id: str = os.environ["SLACK_BOT_ID"]
        s3_bucket: str = os.environ["BUCKET_NAME"]

    except KeyError as err:
        res = create_response(ERROR_RESULT)
        logger.error(f"環境情報の読み出しに失敗しました\n{err}")
        return res

    # ファイル情報を取得
    file_id: str = body["event"]["file_id"]
    slack: WebClient = WebClient(token=token)
    file_info: Optional[SlackResponse] = None
    try:
        file_info = slack.files_info(token=token, file=file_id)
        logger.info(f"file_info: {file_info}")

    except SlackApiError as err:
        res = create_response(ERROR_RESULT)
        logger.error(f"ファイル情報の取得に失敗しました\n{err}")
        return res

    # Slack BOTがアップロードしたファイルなら終了
    if file_info["file"]["user"] == bot_id:
        res = create_response(NORMAL_RESULT)
        logger.info("Slack BOTがアップロードしたファイルです")
        return res

    # ファイル取得
    file_content: Optional[bytes] = download_file(file_info, token)

    # ファイル取得失敗
    if not file_content:
        res = create_response(ERROR_RESULT)
        return res

    # S3へファイルを格納
    file_name: str = file_info["file"]["name"]
    s3_path: str = "raw/" + file_name
    s3.put_object(Bucket=s3_bucket, Body=file_content, Key=s3_path)

    res = create_response(NORMAL_RESULT)

    return res


def download_file(file_info: SlackResponse, token: str) -> Optional[bytes]:
    """
    Slackにアップロードされたファイルを取得する

    param
    ------------
    file_info: dict
        Slackにアップロードされたファイル情報
    token: str
        Slackのアクセストークン
    """
    download_url: str = file_info["file"].get("url_private_download")
    file_content: Optional[bytes] = None
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
            return None

    return file_content


def create_response(result_code: str, challenge: Optional[str] = None) -> dict:
    """
    レスポンスを作成する

    param
    ------------
    result_code: str
        アプリケーションの応答コード
    challenge: str
        Slackの認証リクエスト

    return
    ------------
    dict
        API Gatewayに返却するレスポンス
    """
    res: dict = {
        "statusCode": 200,
        "body": {
            "result_code": result_code,
        },
    }

    if challenge:
        res["body"]["challenge"] = challenge

    return res
