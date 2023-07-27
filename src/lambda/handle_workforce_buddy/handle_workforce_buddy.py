import json
import logging
import os
from typing import Dict

import boto3
from slack_bolt import Ack, App, Say
from slack_bolt.adapter.aws_lambda import SlackRequestHandler

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

SLACK_SIGNING_SECRET = os.environ["SLACK_SIGNING_SECRET"]
SLACK_BOT_TOKEN = os.environ["SLACK_BOT_TOKEN"]
SLACK_BOT_ID: str = os.environ["SLACK_BOT_ID"]
app = App(
    process_before_response=True,
    signing_secret=SLACK_SIGNING_SECRET,
    token=SLACK_BOT_TOKEN,
)


# カスタムエラーを定義
class WorkforceBuddyException(Exception):
    pass


def respond_to_slack_within_3_seconds(ack: Ack) -> None:
    """
    Lazy Lisners機能の使用時に3秒以内にレスポンスを返す

    Args:
        ack (Ack): ackアクション
    """
    ack()


def make_workschedule(event: Dict, say: Say) -> None:
    """
    勤務データを受け取り非同期で勤務表を作成する

    Args:
        event (Dict)
        say (Say): sayアクション
    """
    try:
        file_id: str = event["file_id"]
        user_id: str = event["user_id"]
        channel_id: str = event["channel_id"]
        statemachine_arn: str = os.environ["WORKSCHEDULE_MAKER_KEY"]
    except Exception as err:
        logger.error("event, 環境変数の取得に失敗しました\n{err}")
        raise Exception

    # Slack BOTがアップロードしたファイルなら終了
    if user_id == SLACK_BOT_ID:
        logger.info("Slack BOTがアップロードしたファイルです")
        return None

    # ステートマシンの実行
    try:
        sfn = boto3.client("stepfunctions")
        req: dict = {
            "slack_info": {
                "file_id": file_id,
                "user_id": user_id,
                "channel_id": channel_id,
            }
        }
        res = sfn.start_execution(
            stateMachineArn=statemachine_arn, input=json.dumps(req)
        )
        executionArn: str = res["executionArn"]
        logger.info(f"executionArn: {executionArn}, request: {req}")

    except Exception as err:
        logger.error(f"ステートマシンの実行に失敗しました\n{err}")
        raise WorkforceBuddyException

    # メッセージ送信
    say(f"<@{user_id}>\n勤務データを受け付けました！\n勤務表の作成までしばらくお待ちください。")


app.event("file_shared")(
    ack=respond_to_slack_within_3_seconds, lazy=[make_workschedule]
)


def lambda_handler(event: dict, context: dict) -> SlackRequestHandler:
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
        slack_handler = SlackRequestHandler(app=app)

    except WorkforceBuddyException:
        raise WorkforceBuddyException

    except Exception as err:
        logger.error(f"想定外のエラーが発生しました\n{err}")
        raise WorkforceBuddyException

    return slack_handler.handle(event, context)
