from models import Member


def distribute_workload(
    members: list[Member],
    quantity_number: float | None,
    unit: str | None,
) -> list[dict]:
    """
    Distribute workload evenly among members.

    Returns a list of dicts: [{"member_id": int, "member_name": str, "assigned_amount": str}]
    """
    if not members:
        return []

    unit_str = unit or ""
    results = []

    for member in members:
        if quantity_number is not None and len(members) > 0:
            per_person = quantity_number / len(members)
            rounded = round(per_person, 2)
            # Format nicely: remove trailing zeros
            if rounded == int(rounded):
                amount_str = f"{int(rounded)} {unit_str}".strip()
            else:
                amount_str = f"{rounded} {unit_str}".strip()
        else:
            amount_str = "Phần việc được giao"

        results.append(
            {
                "member_id": member.id,
                "member_name": member.name,
                "assigned_amount": amount_str,
            }
        )

    return results
