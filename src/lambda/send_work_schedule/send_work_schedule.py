import logging
import os
from datetime import datetime

import boto3
from slack_sdk import WebClient
from slack_sdk.web.slack_response import SlackResponse

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# S3クライアント初期化
s3 = boto3.client("s3")

# Slack WebAPIクライアント初期化
SLACK_BOT_TOKEN: str = os.environ["SLACK_BOT_TOKEN"]
slack: WebClient = WebClient(SLACK_BOT_TOKEN)


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

    except WorkforceBuddyException:
        raise WorkforceBuddyException

    except Exception as err:
        logger.error(f"想定外のエラーが発生しました\n{err}")
        raise WorkforceBuddyException

    return res


def logic(event: dict) -> dict:
    """
    メインロジック

    Args:
        event (dict):
            work_schedule_info_list (list)
                work_schedule_info (dict)
                    work_month (str)
                    bucket_name (str)
                    object_name (str)
            slack_info (dict)
                channel_id (str)
                user_id(str)

    Returns:
        dict: レスポンス
    """
    logger.info(f"event: {event}")

    # ファイル情報の読み出し
    try:
        work_schedule_info_list: dict = event["work_schedule_info_list"]
        slack_info: dict = event["slack_info"]
    except Exception:
        logger.error("ファイル情報の読み出しに失敗しました")
        raise WorkforceBuddyException

    uploaded_files: list[str] = []
    for work_schedule_info in work_schedule_info_list:
        # ファイルの取得
        retrieved_file: bytes = get_object_info(work_schedule_info)
        # ファイルのアップロード
        uploaded_file: SlackResponse = upload_file_to_slack(
            work_schedule_info, retrieved_file, uploaded_files
        )
        # ファイルをチャンネルに共有
        share_file_to_channel(work_schedule_info, slack_info, uploaded_file)

    res: dict = create_response(slack_info, uploaded_files)

    return res


def get_object_info(work_schedule_info: dict) -> bytes:
    """
    S3へアップロードされたオブジェクト情報を取得する

    Args:
        work_schedule_info (dict):
            bucket_name (str): アップロードされたファイルのS3バケット名
            object_name (str): アップロードされたファイルのオブジェクト名

    Returns:
        bytes: 勤務表ファイル(バイナリ)
    """
    try:
        work_schedule: bytes = (
            s3.get_object(
                Bucket=work_schedule_info["bucket_name"],
                Key=f"work_schedule/{work_schedule_info['object_name']}",
            )
            .get("Body")
            .read()
        )

    except Exception as err:
        logger.error(f"ファイルの取得に失敗しました\n{err}")
        raise WorkforceBuddyException

    return work_schedule


def upload_file_to_slack(
    work_schedule_info: dict, content: bytes, uploaded_files: list[str]
) -> SlackResponse:
    """
    Slackへファイルをアップロードする

    Args:
        work_schedule_info (dict):
            object_name (str): ファイル名
        content (bytes): ファイルコンテンツ
        uploaded_files (list[str]): アップロードされたファイルのリスト

    Returns:
        SlackResponse: Slackへアップロードされたファイルの情報
    """
    object_name = work_schedule_info["object_name"]

    try:
        # ファイルアップロード
        uploaded_file = slack.files_upload_v2(
            title=object_name,
            filename=object_name,
            content=content,
        )
        logger.info(f"uploaded_file: {uploaded_file}")

        # アップロード成功ファイルのリストアップ
        uploaded_files.append(object_name)

    except Exception as err:
        logger.error(f"ファイルのアップロードに失敗しました\n{err}")
        raise WorkforceBuddyException

    return uploaded_file


def share_file_to_channel(
    work_schedule_info: dict, slack_info: dict, uploaded_file: SlackResponse
) -> None:
    """
    Slackにアップロードされているファイルをチャンネルに共有する

    Args:
        work_schedule_info (dict): 勤務月(ex: '2023-07')
        slack_info (dit): アップロード先のSlack情報
        uploaded_file (SlackResponse): Slackへアップロードされたファイルの情報
    """
    # 勤務した月の変換
    work_month: datetime = datetime.strptime(
        work_schedule_info["work_month"], "%Y-%m"
    )
    year: str = str(work_month.year)
    month: str = str(work_month.month)

    try:
        file_url: str = uploaded_file["file"]["permalink"]
        slack.chat_postMessage(
            channel=slack_info["channel_id"],
            text=f"<@{slack_info['user_id']}>\n{year}年{month}月の勤務表ができました！:\n{file_url}",
        )
    except Exception as err:
        logger.error(f"ファイルの共有に失敗しました\n{err}")
        raise WorkforceBuddyException


def create_response(slack_info: dict, uploaded_files: list[str]) -> dict:
    """
    関数の返却値を生成する

    Args:
        channel_name (str): 送信したチャンネル名
        uploaded_files (list[str]): アップロードしたファイル名のリスト

    Returns:
        dict:
            bucket_name (str): アップロード先S3バケット名
            uploaded_files (list[str]): アップロードしたファイル名
    """
    res: dict = {
        "channel_name": slack_info["channel_id"],
        "user_id": slack_info["user_id"],
        "uploaded_files": uploaded_files,
    }

    return res
