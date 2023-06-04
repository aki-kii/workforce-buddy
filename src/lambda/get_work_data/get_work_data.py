import os
import json
import logging
import requests

import boto3
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# 正常終了
NORMAL_RESULT = "0000"
# ファイル取得失敗
FAILED_GET_FILE = "0010"

s3 = boto3.client("s3")

def lambda_handler(event: dict, context: dict) -> dict:
    """
    Lambdaハンドラー

    param
    -----------
    event: dict
    context: dict
    """
    body: dict = json.loads(event.get("body"))
    logger.info(f"■body: {body}")

    res: dict = logic(body)
    return res


def logic(body: dict) -> dict:
    """
    メインロジック

    param
    ------------
    body: dict
        SlackAPIからのリクエストボディ

    return
    ------------
    dict
        API Gatewayへ返すレスポンス
    """
    logger.debug("Start")

    # SlackAPIの認証リクエストを判定
    if check_challenge(body):
        challenge: str = body["challenge"]
        res: dict = create_response(NORMAL_RESULT, challenge=challenge)
        logger.debug(f"{__name__}: End")

        return res

    # 環境情報を取得
    token: str = os.environ["SLACK_ACCESS_TOKEN"]
    s3_bucket: str = os.environ["BUCKET_NAME"]
    s3_prefix: str = "raw/"

    logger.info(
        f"■token: {token}, ■s3_bucket: {s3_bucket}, ■s3_prefix: {s3_prefix}"
    )

    # ファイル情報を取得
    file_id: str = body["event"]["file_id"]
    client: WebClient = WebClient(token=token)
    logger.info(f"■file_id: {file_id}")

    # Slackからファイル情報を取得
    file_info = get_file_info_for_slack(client, file_id, token)
    logger.info(f"■file_info: {file_info}")

    if file_info:
        # ファイル取得
        file_content: bytes = download_file_for_slack(file_info, token)
        logger.info(f"■file_content: {file_content}")

    # ファイル取得失敗
    if not file_content:
        res: dict = create_response(FAILED_GET_FILE)
        logger.debug("End")
        return res

    # 格納するファイル名を作成
    file_name: str = get_file_name(file_info)
    s3_path: str = s3_prefix + file_name
    logger.info(f"s3_path: {s3_path}")

    # S3へファイルを格納
    s3_put_file(s3, file_content, s3_bucket, s3_path)

    res = create_response(NORMAL_RESULT)

    logger.debug("End")
    return res


def check_challenge(body: dict) -> bool:
    """
    SlackAPIからの認証リクエストを判定

    param
    ------------
    body: dict
        SlackAPIからのリクエストボディ

    return
    ------------
    eool
        認証リクエストが送られている場合はTrue
    """
    logger.debug("Start")

    if body["type"] == "url_verification":
        return True

    logger.debug("End")
    return False


def get_file_name(file_info: str) -> str:
    """
    SlackAPIからファイル名を取得

    param
    ---------
    file_info: dict
        アップロードされたファイルの情報

    return
    ---------
    str
        ファイル名
    """
    logger.debug("Start")

    # ファイル名の取得
    file_name: str = file_info["file"].get("name")

    logger.debug("End")
    return file_name


def get_file_info_for_slack(
    client: WebClient, file_id: str, token: str
) -> dict:
    """
    Slackにアップロードされたファイルの情報を取得

    param
    ---------
    client: WebClient
        SlackのWebClient
    file_id: str
        アップロードされたファイルのID

    return
    ---------
    None
    """
    logger.debug("Start")

    file_info = None
    try:
        file_info = client.files_info(token=token, file=file_id)

    except SlackApiError as err:
        logger.info(f"Error downloading file: {err}")

    logger.debug("End")

    return file_info


def download_file_for_slack(file_info: dict, token: str):
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
    file_content = None
    if download_url:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response: requests.Response = requests.get(
                download_url, headers=headers
            )
            logger.info(f"■response: {response}")
            file_content: bytes = response.content
            logger.info(f"■file_content: {file_content}")
        except Exception as err:
            logger.error(err)

    return file_content


def s3_put_file(s3_client, file: bytes, s3_bucket: str, s3_path: str) -> None:
    """
    S3にファイルをアップロードする

    param
    ------------
    s3_client
        S3のboto3クライアント
    file: bytes
        アップロード対象のファイル
    s3_bucket: str
        アップロード先のS3バケット名
    s3_path: str
        アップロードするS3のプレフィックス名 + ファイル名

    return
    -----------
    None
    """
    logger.debug("Start")

    s3_client.put_object(Bucket=s3_bucket, Body=file, Key=s3_path)

    logger.debug("End")


def create_response(result_code: str, challenge: str = None) -> dict:
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
    logger.debug("Start")

    res: dict = {
        "statusCode": 200,
        "body": {
            "result_code": result_code,
        },
    }

    if challenge:
        res["body"]["challenge"] = challenge

    logger.debug("End")
    return res
