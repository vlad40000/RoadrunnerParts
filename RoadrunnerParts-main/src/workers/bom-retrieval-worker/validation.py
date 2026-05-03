from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, ValidationError, field_validator


PriceStatus = Literal[
    "verified_price",
    "fallback_verified_price",
    "no_verified_price",
    "exact_part_found_no_price",
    "part_not_found",
    "ambiguous_match",
    "blocked",
    "source_error",
]


class ParsedPartRow(BaseModel):
    provider: Literal["encompass"] = "encompass"
    model: str = Field(min_length=1)
    brand: str | None = None
    section: str = Field(min_length=1)
    diagram_number: str | None = None
    original_part_number: str | None = None
    current_service_part_number: str = Field(min_length=1)
    description: str = Field(min_length=1)
    nla_status: bool = False
    replacement_note: str | None = None
    source_url: HttpUrl
    source_type: Literal["distributor"] = "distributor"
    checked_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("current_service_part_number", "original_part_number", mode="before")
    @classmethod
    def clean_part_number(cls, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class PriceSnapshot(BaseModel):
    part_number: str = Field(min_length=1)
    normalized_model: str
    primary_source: Literal["encompass"] = "encompass"
    listed_price: Decimal | None = None
    currency: Literal["USD"] = "USD"
    availability: str | None = None
    product_url: HttpUrl
    product_title: str | None = None
    match_type: Literal["exact_part"] = "exact_part"
    price_status: PriceStatus
    checked_at: datetime = Field(default_factory=datetime.utcnow)
    raw: dict[str, Any] = Field(default_factory=dict)

    @field_validator("listed_price", mode="before")
    @classmethod
    def reject_call_or_missing_prices(cls, value: Any) -> Decimal | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text or "$CALL" in text.upper() or "CALL" == text.upper():
            return None
        try:
            price = Decimal(text.replace("$", "").replace(",", ""))
        except Exception:
            return None
        return price if price > 0 else None

    @field_validator("price_status")
    @classmethod
    def enforce_verified_price_status(cls, value: PriceStatus, info):
        listed_price = info.data.get("listed_price")
        if value in ("verified_price", "fallback_verified_price") and listed_price is None:
            raise ValueError("verified prices require listed_price")
        if value not in ("verified_price", "fallback_verified_price") and listed_price is not None:
            raise ValueError("unverified price statuses cannot carry listed_price")
        return value


def validate_part_row(row: dict[str, Any]) -> ParsedPartRow | None:
    try:
        return ParsedPartRow.model_validate(row)
    except ValidationError:
        return None


def validate_pricing_row(row: dict[str, Any]) -> PriceSnapshot | None:
    try:
        return PriceSnapshot.model_validate(row)
    except ValidationError:
        return None


def evaluate_completion(
    parts: list[ParsedPartRow],
    prices: list[PriceSnapshot],
    expected_part_count: int | None,
) -> dict[str, Any]:
    actual_part_count = len(parts)
    verified_price_count = len(
        [price for price in prices if price.price_status in ("verified_price", "fallback_verified_price")]
    )
    required_price_count = expected_part_count or actual_part_count
    parts_complete = actual_part_count > 0 and (
        expected_part_count is None or actual_part_count >= expected_part_count
    )
    pricing_complete = parts_complete and required_price_count > 0 and verified_price_count >= required_price_count
    bom_complete = parts_complete and pricing_complete

    if bom_complete:
        retrieval_state = "bom_complete"
    elif parts_complete and verified_price_count == 0:
        retrieval_state = "parts_complete_pricing_missing"
    elif parts_complete:
        retrieval_state = "parts_complete_pricing_partial"
    elif actual_part_count > 0:
        retrieval_state = "parts_partial"
    else:
        retrieval_state = "no_result"

    return {
        "actual_part_count": actual_part_count,
        "verified_price_count": verified_price_count,
        "required_price_count": required_price_count,
        "unpriced_count": max(required_price_count - verified_price_count, 0),
        "parts_complete": parts_complete,
        "pricing_complete": pricing_complete,
        "bom_complete": bom_complete,
        "retrieval_state": retrieval_state,
    }
