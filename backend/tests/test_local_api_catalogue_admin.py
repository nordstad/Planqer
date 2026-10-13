"""Editing the catalogue in the browser must decide exactly as the server does.

One scripted session runs through the real admin endpoints and through the
`catalogue_admin` operation. The operation keeps no state: the test plays the
browser's part, handing back the entries it has stored and applying each change
the operation asks for. Every step must give the same status and body.
"""

import json

import pytest
from test_catalogue_local import NEW_BOARD, _login, clean_entries, client  # noqa: F401

from planqer.local_api import handle

pytestmark = pytest.mark.api

BUILT_IN = "se:regel:45x95"
STATUS_ON_SUCCESS = {"add": 201, "reset": 204}


def _call(payload):
    reply = json.loads(handle("catalogue_admin", json.dumps(payload)))
    return reply["status"], reply["body"]


class Browser:
    """The stored entries a browser would hold between calls."""

    def __init__(self):
        self.entries = {}

    def step(self, action, **fields):
        status, body = _call(
            {"action": action, "entries": list(self.entries.values()), **fields}
        )
        if status != 200:
            return status, body
        change = body["change"]
        if change and "put" in change:
            self.entries[change["put"]["product_id"]] = change["put"]
        elif change:
            self.entries.pop(change["delete"], None)
        return STATUS_ON_SUCCESS.get(action, 200), body["result"]


def _http(api, headers, action, *, product_id=None, body=None, catalogue=None, **query):
    params = {k: v for k, v in {"catalogue": catalogue, **query}.items() if v}
    base = "/api/admin/catalogue"
    if action == "list":
        response = api.get(base, params=params, headers=headers)
    elif action == "add":
        response = api.post(base, params=params, json=body, headers=headers)
    elif action == "update":
        response = api.put(
            f"{base}/{product_id}", params=params, json=body, headers=headers
        )
    elif action in ("hide", "restore"):
        response = api.post(
            f"{base}/{product_id}/{action}", params=params, headers=headers
        )
    elif action == "suggest":
        response = api.get(
            f"{base}/{product_id}/suggestion", params=params, headers=headers
        )
    else:
        response = api.delete(f"{base}/{product_id}", params=params, headers=headers)
    return response.status_code, _readable(
        response.json() if response.content else None
    )


def _readable(body):
    """FastAPI adds the rejected input and context to a 422; `local_api` keeps
    only what the screens read: type, loc and msg."""
    if isinstance(body, dict) and isinstance(body.get("detail"), list):
        fields = ("type", "loc", "msg")
        return {"detail": [{k: d[k] for k in fields} for d in body["detail"]]}
    return body


def _local_fields(action, *, product_id=None, body=None, catalogue=None, **query):
    fields = {"catalogue": catalogue, **query}
    if product_id:
        fields["product_id"] = product_id
    if body is not None:
        fields["body"] = body
    return {k: v for k, v in fields.items() if v is not None}


SESSION = [
    ("list", {}),
    ("list", {"catalogue": "NO"}),
    ("add", {"body": NEW_BOARD}),
    ("add", {"body": NEW_BOARD}),  # 409: it already exists
    (
        "add",
        {"body": {**NEW_BOARD, "type": "regel", "thickness": 45, "width": 95}},
    ),  # 409: built in
    ("add", {"body": {**NEW_BOARD, "thickness": 0}}),  # 422 from the schema
    (
        "add",
        {"body": {**NEW_BOARD, "lengths": [99999]}},
    ),  # 422 from the catalogue checks
    (
        "update",
        {"product_id": BUILT_IN, "body": {"lengths": [2400, 4800], "note": "mine"}},
    ),
    ("update", {"product_id": "local:regel:48x98", "body": {"lengths": [3000]}}),
    ("update", {"product_id": "se:nope:1x1", "body": {"lengths": [3000]}}),  # 404
    ("update", {"product_id": BUILT_IN, "body": {"lengths": [99999]}}),  # 422
    ("hide", {"product_id": BUILT_IN}),
    ("hide", {"product_id": "se:nope:1x1"}),  # 404
    ("list", {}),
    ("restore", {"product_id": BUILT_IN}),
    (
        "suggest",
        {"product_id": BUILT_IN, "source": "https://example.com/p", "country": "SE"},
    ),
    (
        "suggest",
        {"product_id": BUILT_IN, "source": "http://insecure", "country": "SE"},
    ),  # 422
    ("suggest", {"product_id": "se:nope:1x1"}),  # 404
    ("reset", {"product_id": BUILT_IN}),
    ("reset", {"product_id": "local:regel:48x98"}),
    ("reset", {"product_id": "se:nope:1x1"}),  # 404
    ("list", {}),
]


def test_a_whole_editing_session_gives_the_same_answers(client):  # noqa: F811
    headers = _login(client, admin=True)
    browser = Browser()

    for number, (action, options) in enumerate(SESSION, start=1):
        http = _http(client, headers, action, **options)
        local = browser.step(action, **_local_fields(action, **options))
        assert local == http, f"step {number}: {action} {options}"


def test_the_browser_view_of_the_catalogue_sees_the_edits(client):  # noqa: F811
    headers = _login(client, admin=True)
    browser = Browser()
    browser.step("add", body=NEW_BOARD)
    browser.step("hide", product_id=BUILT_IN)

    status, body = _call({"action": "list", "entries": list(browser.entries.values())})
    assert status == 200
    by_id = {item["product"]["id"]: item for item in body["result"]}
    assert by_id["local:regel:48x98"]["origin"] == "local"
    assert by_id[BUILT_IN]["hidden"] is True
    del headers


def test_an_unknown_action_or_missing_product_is_rejected():
    assert _call({"action": "explode"})[0] == 422
    assert _call({"action": "hide"})[0] == 422
