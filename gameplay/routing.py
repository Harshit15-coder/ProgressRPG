from django.urls import re_path, URLPattern

websocket_urlpatterns: list[URLPattern] = []


def load_websocket_urlpatterns():
    from .consumers import TimerConsumer

    return [
        re_path(r"ws/profile_(?P<profile_id>\d+)/$", TimerConsumer.as_asgi()),
    ]
