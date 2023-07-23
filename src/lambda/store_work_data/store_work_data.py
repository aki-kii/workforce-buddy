import io
import json
import logging
import os
from typing import Optional

import boto3
import numpy as np
import pandas as pd

# ロギングの初期設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")


# カスタムエラーを定義
class WorkforceBuddyException(Exception):
    pass


# アップロードされた勤務ファイルのヘッダー
FILE_HEADERS: list[str] = [
    "id",
    "name",
    "date",
    "work_num",
    "date_code",
    "date_type",
    "work_code",
    "work_type",
    "start_time",
    "end_time",
    "start_time_round",
    "end_time_round",
    "break_hours",
    "work_hours",
    "night_hours",
    "memo",
    "approver",
    "approval_datetime",
    "second_approver",
    "second_approval_datetime",
    "third_approver",
    "third_approval_datetime",
]

# 必要な勤務ファイルのヘッダー
WORK_FILE_HEADER: list[str] = [
    "id",
    "SK",
    "datetime",
    "date_code",
    "work_code",
    "start_datetime",
    "end_datetime",
    "break_hours",
    "work_hours",
    "night_hours",
    "memo",
]


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
        event (dict)

    Returns:
        dict: レスポンス
    """
    # 環境情報の読み出し
    try:
        file_name: str = event["file_info"]["result"]["file_name"]
        bucket_name: str = os.environ["BUCKET_NAME"]

    except Exception:
        logger.error("環境情報の読み出しに失敗しました")
        raise WorkforceBuddyException

    # 勤務データファイルの取得
    work_file: Optional[bytes] = None
    try:
        work_file = (
            s3.get_object(Bucket=bucket_name, Key=f"raw/{file_name}")
            .get("Body")
            .read()
        )

    except Exception:
        logger.error("ファイルの取得に失敗しました")
        raise WorkforceBuddyException

    # ファイルを取得できなかった場合
    if not work_file:
        logger.error("ファイルの取得に失敗しました")
        raise WorkforceBuddyException

    # ファイルの読み込み
    work_data: pd.DataFrame = load_work_data(work_file)

    # データの加工
    converted_work_data: pd.DataFrame = convert_work_data(work_data)

    # 登録するデータをJSON形式に変換
    converted_work_json: list[dict] = json.loads(
        converted_work_data.to_json(orient="table", index=False)
    ).get("data")

    # データの登録
    store_work_data(converted_work_json)

    # データから返却情報を生成
    res = create_response(work_data)

    return res


def load_work_data(work_file: bytes) -> pd.DataFrame:
    """
    アップロードされた勤務データ表の値を読み出す

    Args:
        work_file (bytes): 勤務データファイル(バイナリ)

    Returns:
        pd.DataFrame: 勤務情報データフレーム
    """
    try:
        work_data = pd.read_csv(
            io.BytesIO(work_file),
            encoding="Shift-JIS",
            delimiter="\t",
            names=FILE_HEADERS,
            index_col=None,
            skiprows=[0],
            dtype=str,
            engine="python",
        )

    except Exception as err:
        logger.error(f"データの読み込みに失敗しました\n{err}")
        raise WorkforceBuddyException

    return work_data


def convert_work_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    勤務データをDBへ登録する形へ変換する


    Args:
        df (pd.DataFrame): ファイル内の勤務データ

    Returns:
        pd.DataFrame: DBへ登録する形の勤務データ
    """
    # 日付の形式を変換(ex: '20230510' -> datetime(2023-05-10))
    df["datetime"] = pd.to_datetime(df["date"])

    # 開始時刻の形式を変換(ex: '18:00' -> '2023-05-10 18:00:00')
    df.loc[df["start_time"].notna(), "start_datetime"] = (
        df["datetime"] + df["start_time"].map(time_paser)
    ).astype(str)

    # 終了時刻の形式を変換(ex: '24:00' -> '2023-05-11 00:00:00')
    df.loc[df["end_time"].notna(), "end_datetime"] = (
        df["datetime"] + df["end_time"].map(time_paser)
    ).astype(str)

    # 日付を文字列に変換(ex: datetime(2023-05-10) -> '2023-05-10')
    df["datetime"] = df["datetime"].astype(str)

    # ソートキーを定義(ex: 'WorkData#2023-05-10#01')
    df["SK"] = df["datetime"].map(lambda x: f"WorkData#{x}") + df[
        "work_num"
    ].map(lambda x: f"#{x:>02}")

    # 必要なカラムだけに絞る
    df = df[WORK_FILE_HEADER]

    return df


def time_paser(time: str) -> pd.Timedelta:
    """
    'hh:mm'形式で渡された時刻を、hh時間mm分の時間差に変換する

    Args:
        time (str): 'hh:mm'形式の時刻

    Returns:
        pd.Timedelta: hh時間mm分の時間差
    """
    # naの場合nanを返す
    if time is np.nan:
        return np.nan

    # 時間差を算出する
    # '18:00' -> pd.Timedelta(hours=18, minutes=0)
    hours: int
    minutes: int
    hours, minutes = map(int, time.split(":"))
    delta: pd.Timedelta = pd.Timedelta(hours=hours, minutes=minutes)

    return delta


def store_work_data(work_data: list[dict]) -> None:
    """
    勤務データ(pd.DataFrame)をDynamoDBへ登録する

    Args:
        work_data (list[dict]): 登録する勤務データのリスト
    """
    # DynamoDBテーブル名の取得
    table_name = os.environ["TABLE_NAME"]

    # DynamoDBテーブルの取得
    table = dynamodb.Table(table_name)

    # DynamoDBへレコードの書き込み
    try:
        with table.batch_writer() as batch:
            for item in work_data:
                batch.put_item(Item=item)

    except Exception as err:
        logger.error(f"DynamoDBへの登録が失敗しました\n{err}")
        raise WorkforceBuddyException


def create_response(work_data: pd.DataFrame) -> dict:
    """
    レスポンスを作成する

    Args:
        work_data (pd.DataFrame): 勤務データ

    Returns:
        dict:
            user_id (str): ユーザの社員番号
            work_months (list[str]): 勤務データが入力された月のリスト
    """
    user_id = work_data.loc[0, "id"]
    # 勤務データに含まれる年月をリストに変換
    # ex: ["2023-05", "2023-06"]
    work_months = (
        work_data["date"].map(lambda x: f"{x[:4]}-{x[4:6]}").unique().tolist()
    )

    res = {"user_id": user_id, "work_months": work_months}

    return res
