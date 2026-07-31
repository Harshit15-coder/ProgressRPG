from users.models import CustomUser
from users.services.registration_services import ensure_player_setup_for_user
from uuid import uuid4


def user_factory(
    email=None,
    password="testpassword123",
    *,
    with_player=False,
    **kwargs,
):
    user = CustomUser.objects.create(
        email=email or f"{uuid4()}@example.com",
        **kwargs,
    )

    user.set_password(password)
    user.save(update_fields=["password"])

    if with_player:
        ensure_player_setup_for_user(user)

    return user
