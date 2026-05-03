from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from decimal import Decimal

class ParsedPartRow(BaseModel):
    model_number: str
    source: Literal["encompass"]
    assembly_name: Optional[str] = None
    part_number: str
    description: Optional[str] = None
    diagram_ref: Optional[str] = None
    quantity: Optional[int] = None
    source_url: str
    confidence: float = Field(default=1.0, ge=0, le=1)

    @field_validator("part_number")
    @classmethod
    def clean_part_number(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("part_number is required")
        return value

class PriceSnapshot(BaseModel):
    model_number: str
    source: Literal["encompass"]
    part_number: str
    price: Decimal
    currency: Literal["USD"] = "USD"
    availability: Optional[str] = None
    price_url: str

    @field_validator("price")
    @classmethod
    def price_must_be_real(cls, value: Decimal):
        if value <= 0:
            raise ValueError("price must be a positive number")
        return value
