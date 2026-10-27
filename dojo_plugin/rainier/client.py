import requests

from .contracts import origin


class DeliveryUncertain(RuntimeError):
    pass


class RainierClient:
    def __init__(self, host):
        self.host = origin(host)
        self.transport = requests.Session()
        self.transport.trust_env = False

    def request(self, path, *, data=None, payload=None):
        try:
            response = self.transport.post(self.host + path, data=data, json=payload,
                                           timeout=(5, 20), allow_redirects=False)
        except requests.RequestException:
            raise DeliveryUncertain("未取得远端确认；需核对平台记录后再重试，避免重复提交") from None
        try:
            if response.status_code != 200:
                raise DeliveryUncertain(f"远端返回 HTTP {response.status_code}，未确认保存")
            try:
                body = response.json()
            except ValueError:
                raise DeliveryUncertain("远端响应不是 JSON，未确认保存") from None
            if not isinstance(body, dict):
                raise DeliveryUncertain("远端返回结构无效，未确认保存")
            return body
        finally:
            response.close()

    def authenticate(self, app_id, sequence_code):
        return self.request(f"/openapi/{app_id}", data={"sequenceCode": sequence_code})

    def upload(self, payload):
        return self.request("/openapi/data_upload", payload=payload)

    def close(self):
        self.transport.close()
