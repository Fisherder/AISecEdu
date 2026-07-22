import random
import string
import urllib.parse

import pytest
import requests

from utils import DOJO_URL, login


@pytest.mark.parametrize("endpoint", ["/", "/dojos", "/login", "/register"])
def test_unauthenticated_return_200(endpoint):
    response = requests.get(f"{DOJO_URL}{endpoint}")
    assert response.status_code == 200, (
        f"Expected status code 200, but got {response.status_code}"
    )


def test_login():
    login("admin", "incorrect_password", success=False)
    login("admin", "admin")


def test_register():
    random_id = "".join(random.choices(string.ascii_lowercase, k=16))
    login(random_id, random_id, register=True)


@pytest.mark.parametrize(
    "endpoint", ["/", "/dojos", "/login", "/register", "/reset_password"]
)
def test_public_pages_use_aisecedu_theme(endpoint):
    response = requests.get(f"{DOJO_URL}{endpoint}")
    assert response.status_code == 200
    assert "brand-mono-bold" in response.text
    assert '<span class="brand-white">AISecEdu</span>' in response.text
    assert "pwn.college" not in response.text.lower()


@pytest.mark.parametrize(
    "asset",
    [
        "learning-common",
        "learning-overview",
        "learning-dashboard",
        "learning-studio",
        "learning-tutor",
    ],
)
def test_learning_theme_assets_are_served(asset):
    response = requests.get(
        f"{DOJO_URL}/themes/dojo_theme/static/js/dojo/{asset}.min.js"
    )
    assert response.status_code == 200
    assert "javascript" in response.headers["Content-Type"]
    assert len(response.content) > 100


@pytest.mark.parametrize(
    ("endpoint", "destination"),
    [
        ("/forgot-password", "/reset_password"),
        ("/reset-password/example", "/reset_password/example"),
        ("/verify-email/example", "/confirm/example"),
        ("/community", "/dojos"),
        ("/leaderboard", "/dojos"),
    ],
)
def test_removed_frontend_routes_are_canonicalized(endpoint, destination):
    response = requests.get(f"{DOJO_URL}{endpoint}", allow_redirects=False)
    assert response.status_code == 308
    assert urllib.parse.urlparse(response.headers["Location"]).path == destination


def test_public_authentication_configuration():
    response = requests.get(f"{DOJO_URL}/pwncollege_api/v1/auth/config")
    assert response.status_code == 200
    data = response.json()["data"]
    assert isinstance(data["registrationEnabled"], bool)
    assert data["commitment"]["required"] is True
    assert "AISecEdu 课程题目" in data["commitment"]["text"]
    assert "DOJO" not in data["commitment"]["text"]
