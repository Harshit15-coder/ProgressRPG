from .models import GoodsStock


def convert_goods(
    input_building,
    output_building,
    *,
    input_good,
    output_good,
    workers_present,
    per_worker_capacity,
    conversion_ratio,
    max_output=None,
):
    """
    Convert input_good stock at input_building into output_good stock at
    output_building (may be the same building, or different - e.g. a mill
    consumes grain from the village granary but stores flour at itself).

    Capped by, in order:
    - labor: workers_present * per_worker_capacity units of input processed
    - available input stock
    - output storage headroom, converted back into input units - this
      throttles how much input is consumed rather than consuming it and
      discarding output that doesn't fit, since the input good typically
      keeps fine sitting in storage while the output good may not.
    - max_output, if given (also converted back into input units) - lets a
      caller cap production by demand rather than by capacity/labor, e.g. a
      bakery only baking enough bread to cover today's expected consumption
      instead of baking up to its full storage/labor limit.

    Returns the amount of input actually converted (== output produced /
    conversion_ratio, rounded).

    Operates purely on `quantity`, which is already unit-consistent (grams)
    on both sides for every conversion that exists today (wheat -> flour ->
    bread, per GOOD_TYPE_UNIT) - unaffected by GOOD_TYPE_BULK_DENSITY, which
    only feeds into GoodsStock.capacity, not quantity. Both sides are
    weight-kind goods, so amounts are rounded to whole grams - there's no
    meaningful sub-gram precision to preserve.
    """
    input_stock = GoodsStock.objects.filter(
        building=input_building, good_type=input_good
    ).first()
    available_input = input_stock.quantity if input_stock else 0

    labor_cap = workers_present * per_worker_capacity

    output_stock, _ = GoodsStock.objects.get_or_create(
        building=output_building, good_type=output_good
    )
    output_headroom = max(0.0, output_stock.capacity - output_stock.quantity)
    output_headroom_in_input_units = output_headroom / conversion_ratio

    caps = [available_input, labor_cap, output_headroom_in_input_units]
    if max_output is not None:
        caps.append(max(0.0, max_output) / conversion_ratio)

    input_to_convert = round(min(caps))
    if input_to_convert <= 0:
        return 0

    input_stock.quantity -= input_to_convert
    input_stock.save(update_fields=["quantity"])

    output_stock.quantity += round(input_to_convert * conversion_ratio)
    output_stock.save(update_fields=["quantity"])

    return input_to_convert
