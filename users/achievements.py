ACHIEVEMENT_DEFINITIONS = [
    {
        "type": "level",
        "label": "Player level",
        "symbol": "⭐",
        "thresholds": [2, 5, 10, 20, 50],
    },
    {
        "type": "time",
        "label": "Total time",
        "symbol": "⏱️",
        "thresholds": [
            30 * 60,
            5 * 60 * 60,
            20 * 60 * 60,
            75 * 60 * 60,
            300 * 60 * 60,
        ],
    },
    {
        "type": "activities",
        "label": "Activities",
        "symbol": "✅",
        "thresholds": [5, 25, 100, 500, 2000],
    },
]

TIER_COLORS = ["grey", "green", "blue", "purple", "gold"]


def achievement_goals_for_player(player):
    values = {
        "level": player.level,
        "time": player.total_time,
        "activities": player.total_activities,
    }

    goals = []
    for definition in ACHIEVEMENT_DEFINITIONS:
        thresholds = definition["thresholds"]
        value = values[definition["type"]]
        target_index = next(
            (index for index, threshold in enumerate(thresholds) if value < threshold),
            len(thresholds) - 1,
        )
        complete = target_index == len(thresholds) - 1 and value >= thresholds[-1]

        goals.append(
            {
                "type": definition["type"],
                "label": definition["label"],
                "symbol": definition["symbol"],
                "tier": target_index + 1,
                "complete": complete,
                "color": TIER_COLORS[target_index],
                "value": value,
                "threshold": thresholds[target_index],
                "next_threshold": (
                    thresholds[target_index + 1]
                    if target_index + 1 < len(thresholds)
                    else None
                ),
            }
        )

    return goals
