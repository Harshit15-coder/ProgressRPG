from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.admin import SimpleListFilter
from django.db.models import Max
from django.forms.models import BaseInlineFormSet
from adminsortable2.admin import SortableAdminMixin

from .models import (
    CustomUser,
    Player,
    PlayerCurrency,
    UserLogin,
    InviteCode,
    TutorialStep,
    Waitlist,
)
from .services import waitlist_service
from character.models import PlayerCharacterLink, Character
from payments.models import UserSubscription

# Register your models here.


class IsPremiumFilter(SimpleListFilter):
    title = "premium"
    parameter_name = "is_premium"

    def lookups(self, request, model_admin):
        return [("yes", "Premium"), ("no", "Free")]

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(usersubscription__active=True)
        if self.value() == "no":
            return queryset.exclude(usersubscription__active=True)


class IsOnlineFilter(SimpleListFilter):
    title = "online"
    parameter_name = "is_online"

    def lookups(self, request, model_admin):
        return [("yes", "Online"), ("no", "Offline")]

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(player__is_online=True)
        if self.value() == "no":
            return queryset.filter(player__is_online=False)


class PlayerInline(admin.TabularInline):
    model = Player
    extra = 0
    max_num = 1
    fields = (
        "name",
        "is_online",
        "level",
        "xp",
        "xp_next_level",
        "last_seen",
        "onboarding_step",
        "onboarding_completed",
        "is_deleted",
    )
    readonly_fields = ("is_online", "level", "xp", "last_seen")
    can_delete = False


class UserLoginInlineFormSet(BaseInlineFormSet):
    def get_queryset(self):
        # Show only the most recent login events in the admin inline.
        return super().get_queryset().order_by("-timestamp")[:5]


class UserLoginInline(admin.TabularInline):
    model = UserLogin
    verbose_name_plural = "Most recent logins"
    classes = ("collapse",)
    formset = UserLoginInlineFormSet
    extra = 0
    max_num = 5
    readonly_fields = ("timestamp", "is_first_login_of_day")
    can_delete = False


class PlayerCurrencyInline(admin.TabularInline):
    model = PlayerCurrency
    extra = 0
    fields = ("currency", "earned", "spent", "balance", "last_calculated_at")
    readonly_fields = ("balance",)


class UserSubscriptionInline(admin.TabularInline):
    model = UserSubscription
    classes = ("collapse",)
    extra = 0
    max_num = 2
    fields = (
        "plan",
        "stripe_subscription_id",
        "active",
        "start_date",
        "end_date",
    )
    readonly_fields = ("start_date",)


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = [
        "email",
        "get_is_premium",
        "get_player_online",
        "last_recorded_login",
        "current_login_streak",
        "days_logged_in",
        "created_at",
    ]
    list_filter = [
        "is_staff",
        "is_active",
        IsPremiumFilter,
        IsOnlineFilter,
    ]
    date_hierarchy = "created_at"
    fieldsets = (
        (None, {"fields": ("email", "password", "stripe_customer_id")}),
        ("Personal Info", {"fields": ("date_of_birth",)}),
        (
            "Logins",
            {
                "classes": ("collapse",),
                "fields": (
                    "last_login",
                    "last_recorded_login",
                    "days_logged_in",
                    "current_login_streak",
                    "max_login_streak",
                ),
            },
        ),
        (
            "Permissions",
            {
                "classes": ("collapse",),
                "fields": (
                    "is_staff",
                    "is_superuser",
                    "is_active",
                    "is_confirmed",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("created_at",)}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "is_staff", "is_active"),
            },
        ),
    )
    search_fields = ["email"]
    ordering = ("-created_at",)

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.annotate(last_recorded_login_sort=Max("logins__timestamp"))

    def save_model(self, request, obj, form, change):
        if not change:
            obj.is_confirmed = True
        super().save_model(request, obj, form, change)

    readonly_fields = [
        "created_at",
        "last_login",
        "last_recorded_login",
        "days_logged_in",
        "current_login_streak",
        "max_login_streak",
    ]
    inlines = [PlayerInline, UserLoginInline, UserSubscriptionInline]

    @admin.display(description="Recorded login", ordering="last_recorded_login_sort")
    def last_recorded_login(self, obj):
        return obj.last_recorded_login

    @admin.display(description="Days logged in")
    def days_logged_in(self, obj):
        return obj.days_logged_in

    @admin.display(description="Current streak")
    def current_login_streak(self, obj):
        return obj.current_login_streak

    @admin.display(description="Max streak")
    def max_login_streak(self, obj):
        return obj.max_login_streak

    @admin.display(boolean=True, description="Premium")
    def get_is_premium(self, obj):
        try:
            return obj.player.is_premium
        except Player.DoesNotExist:
            return None

    @admin.display(boolean=True, description="Player online")
    def get_player_online(self, obj):
        try:
            return obj.player.is_online
        except Player.DoesNotExist:
            return None


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "name",
        "is_online",
        "get_character",
        "current_login_streak",
        "days_logged_in",
        "user_created_at",
        "level",
    ]
    list_filter = [
        "is_online",
        "last_seen",
    ]

    fieldsets = (
        (None, {"fields": ("user", "name")}),
        (
            "Presence",
            {
                "fields": (
                    "is_online",
                    "active_connections",
                    "last_seen",
                ),
            },
        ),
        (
            "Login",
            {
                "fields": (
                    "days_logged_in",
                    "current_login_streak",
                    "max_login_streak",
                ),
            },
        ),
        (
            "Levels/xp",
            {
                #'classes': ('collapse',),
                "fields": (
                    "xp",
                    "xp_next_level",
                    "xp_modifier",
                    "level",
                ),
            },
        ),
        (
            "Metrics",
            {
                "fields": ("total_time", "total_activities"),
            },
        ),
        (
            "Other",
            {
                "fields": ("onboarding_completed", "onboarding_step", "is_deleted"),
            },
        ),
    )

    readonly_fields = [
        "is_online",
        "active_connections",
        "last_seen",
        "is_premium",
        "days_logged_in",
        "current_login_streak",
        "max_login_streak",
        "user_created_at",
        "total_time",
        "total_activities",
    ]
    search_fields = ["name", "user__email"]
    ordering = ("-created_at",)
    inlines = [PlayerCurrencyInline]

    @admin.display(description="Character")
    def get_character(self, obj):
        try:
            return PlayerCharacterLink.get_character(obj)
        except ValueError:
            return "-"

    @admin.display(boolean=True, description="Has Character")
    def has_character(self, obj):
        return PlayerCharacterLink.objects.filter(player=obj, is_active=True).exists()

    @admin.display(
        description="User Created",
        ordering="user__created_at",
    )
    def user_created_at(self, obj):
        return obj.user.created_at

    @admin.display(description="Days logged in")
    def days_logged_in(self, obj):
        return obj.user.days_logged_in

    @admin.display(description="Current streak")
    def current_login_streak(self, obj):
        return obj.user.current_login_streak

    @admin.display(description="Max streak")
    def max_login_streak(self, obj):
        return obj.user.max_login_streak


@admin.register(InviteCode)
class InviteCodeAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "is_active",
        "max_uses",
        "uses",
        "expires_at",
    ]
    list_filter = [
        "is_active",
    ]
    fields = [
        "code",
        "is_active",
        "expires_at",
        "max_uses",
        "uses",
    ]
    readonly_fields = ["uses"]


@admin.register(Waitlist)
class WaitlistAdmin(admin.ModelAdmin):
    list_display = ["email", "status", "signup_timestamp", "invited_at"]
    list_filter = ["status"]
    search_fields = ["email"]
    ordering = ["signup_timestamp"]
    readonly_fields = ["invite_token", "signup_timestamp"]
    actions = [
        "invite_selected_now",
        "resend_invite_email_action",
        "mark_as_removed",
        "export_selected_to_csv",
    ]

    @admin.action(description="Invite selected now")
    def invite_selected_now(self, request, queryset):
        eligible = queryset.filter(status=Waitlist.Status.WAITING)
        count = 0
        for entry in eligible:
            waitlist_service.invite_entry(entry)
            count += 1
        skipped = queryset.count() - count
        msg = f"Invited {count} waitlist entrant(s)."
        if skipped:
            msg += f" Skipped {skipped} not in 'waiting' status."
        self.message_user(request, msg)

    @admin.action(description="Resend invite email")
    def resend_invite_email_action(self, request, queryset):
        eligible = queryset.filter(status=Waitlist.Status.INVITED)
        count = 0
        for entry in eligible:
            waitlist_service.resend_invite_email(entry)
            count += 1
        skipped = queryset.count() - count
        msg = f"Resent invite email to {count} entrant(s)."
        if skipped:
            msg += f" Skipped {skipped} not currently 'invited'."
        self.message_user(request, msg)

    @admin.action(description="Mark as removed")
    def mark_as_removed(self, request, queryset):
        updated = queryset.update(status=Waitlist.Status.REMOVED)
        self.message_user(request, f"Marked {updated} entrant(s) as removed.")

    @admin.action(description="Export selected to CSV")
    def export_selected_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="waitlist_export.csv"'
        writer = csv.writer(response)
        writer.writerow(
            ["email", "status", "signup_timestamp", "invited_at", "invite_token"]
        )
        for entry in queryset:
            writer.writerow(
                [
                    entry.email,
                    entry.status,
                    entry.signup_timestamp,
                    entry.invited_at,
                    entry.invite_token,
                ]
            )
        return response


@admin.register(TutorialStep)
class TutorialStepAdmin(SortableAdminMixin, admin.ModelAdmin):
    list_display = ["order", "title", "image", "youtube_url"]
    ordering = ["order"]


@admin.register(PlayerCurrency)
class PlayerCurrencyAdmin(admin.ModelAdmin):
    list_display = ["player", "currency", "balance", "earned", "spent"]
    list_filter = ["currency"]
    search_fields = [
        "player__name",
        "player__user__email",
        "currency__code",
        "currency__name",
    ]
    readonly_fields = ["balance"]
