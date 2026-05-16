from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class EvidenceQuality(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERIFIED = "verified"


class SerialScopeStatus(str, Enum):
    SERIAL_SPECIFIC = "serial_specific"
    MODEL_LEVEL_ONLY = "model_level_only"
    UNKNOWN = "unknown"


class RetrievalState(str, Enum):
    IDENTITY_RESOLVED = "identity_resolved"
    PROVIDER_ROUTES_FOUND = "provider_routes_found"
    DIAGRAM_CANDIDATES_FOUND = "diagram_candidates_found"
    HITL_REVIEW_REQUIRED = "hitl_review_required"
    SECTIONS_LOCKED = "sections_locked"
    SELECTED_SECTIONS_QUEUED = "selected_sections_queued"
    SECTION_EXTRACTING = "section_extracting"
    SECTION_PARTS_PARTIAL = "section_parts_partial"
    SECTION_PARTS_COMPLETE = "section_parts_complete"
    SECTION_PRICING_PARTIAL = "section_pricing_partial"
    SECTION_COMPLETE = "section_complete"
    MODEL_PARTIAL = "model_partial"
    MODEL_COMPLETE = "model_complete"
    FAILED_NO_SOURCE_TRUTH = "failed_no_source_truth"
    FAILED_VALIDATION = "failed_validation"


class HumanDecision(str, Enum):
    APPROVE_SECTION = "approve_section"
    REJECT_SECTION = "reject_section"
    EDIT_SECTION_NAME = "edit_section_name"
    ENTER_EXPECTED_COUNT = "enter_expected_count"
    ENTER_PROVIDER_MODEL_URL = "enter_provider_model_url"
    ENTER_SECTION_URL = "enter_section_url"
    REQUEST_PLAYWRIGHT_CAPTURE = "request_playwright_capture"
    REQUEST_AI_EXTRACT_SELECTED_SECTIONS = "request_ai_extract_selected_sections"
    APPROVE_PART_ROW = "approve_part_row"
    REJECT_PART_ROW = "reject_part_row"
    APPROVE_PRICE_ROW = "approve_price_row"
    REJECT_PRICE_ROW = "reject_price_row"


class SectionState(str, Enum):
    UNKNOWN_EXPECTED_COUNT = "unknown_expected_count"
    PARTS_MISSING = "parts_missing"
    PARTS_PARTIAL = "parts_partial"
    PARTS_COMPLETE = "parts_complete"
    PRICING_PARTIAL = "pricing_partial"
    COMPLETE = "complete"
    HITL_REQUIRED = "hitl_required"


class SourceProvider(str, Enum):
    ENCOMPASS = "encompass"
    RELIABLE_PARTS = "reliableparts"
    DLPARTS = "dlparts"
    SEARS_PARTSDIRECT = "searspartsdirect"
    PARTSDR = "partsdr"
    PARTSELECT = "partselect"
    APPLIANCE_PARTS_PROS = "appliancepartspros"
    REPAIRCLINIC = "repairclinic"
    FIX = "fix"
    EBAY = "ebay"
    OTHER = "other"


class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: SourceProvider | str
    url: str | None = None
    artifact_id: str | None = None
    captured_at: datetime | None = None
    text_hash: str | None = None
    screenshot_path: str | None = None
    notes: str | None = None
    quality: EvidenceQuality = EvidenceQuality.NONE

    @model_validator(mode="after")
    def require_some_evidence(self) -> "EvidenceRef":
        if not self.url and not self.artifact_id and not self.text_hash and not self.screenshot_path:
            self.quality = EvidenceQuality.NONE
        return self


class MachineIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manufacturer: str | None = None
    appliance_type: str | None = None
    model_number: str
    normalized_model: str
    serial_number: str | None = None
    series_revision: str | None = None
    serial_scope_status: SerialScopeStatus = SerialScopeStatus.UNKNOWN
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)

    @field_validator("normalized_model", "model_number")
    @classmethod
    def normalize_model_text(cls, value: str) -> str:
        cleaned = "".join(ch for ch in value.upper() if ch.isalnum())
        if not cleaned:
            raise ValueError("model number cannot be empty")
        return cleaned


class CandidateSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: SourceProvider | str
    model_url: str
    title: str | None = None
    model_match: bool = False
    serial_match: bool | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    reason_flags: list[str] = Field(default_factory=list)


class CandidateSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_id: str
    section_name: str
    section_sequence: int | None = None
    provider: SourceProvider | str
    section_url: str | None = None
    diagram_url: str | None = None
    image_url: str | None = None
    expected_part_count: int | None = Field(default=None, ge=0)
    found_part_count: int = Field(default=0, ge=0)
    priced_part_count: int = Field(default=0, ge=0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    reason_flags: list[str] = Field(default_factory=list)
    requires_hitl: bool = True

    @model_validator(mode="after")
    def classify_hitl_need(self) -> "CandidateSection":
        has_url = bool(self.section_url or self.diagram_url or self.image_url)
        self.requires_hitl = self.confidence < 0.92 or not has_url
        return self


class HumanReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: HumanDecision
    target_id: str
    value: str | int | bool | None = None
    reviewer: str | None = None
    reviewed_at: datetime = Field(default_factory=datetime.utcnow)
    notes: str | None = None


class DiagramDiscoveryPacket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: MachineIdentity
    candidate_sources: list[CandidateSource] = Field(default_factory=list)
    candidate_sections: list[CandidateSection] = Field(default_factory=list)
    expected_total_part_count: int | None = Field(default=None, ge=0)
    expected_count_source: str | None = None
    retrieval_state: RetrievalState
    failure_reason: str | None = None
    recommended_action: str | None = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def enforce_review_state(self) -> "DiagramDiscoveryPacket":
        if not self.candidate_sections:
            self.retrieval_state = RetrievalState.HITL_REVIEW_REQUIRED
            self.recommended_action = self.recommended_action or "Find or enter official diagram sections."
        elif any(section.requires_hitl for section in self.candidate_sections):
            self.retrieval_state = RetrievalState.HITL_REVIEW_REQUIRED
            self.recommended_action = self.recommended_action or "Review candidate sections and approve the correct ones."
        return self


class LockedSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_id: str
    section_name: str
    provider: SourceProvider | str
    section_url: str
    diagram_url: str | None = None
    image_url: str | None = None
    expected_part_count: int | None = Field(default=None, ge=0)
    selected_by: str | None = None
    selected_at: datetime = Field(default_factory=datetime.utcnow)
    extraction_mode: Literal["deterministic_parser", "ai_from_locked_section", "hybrid"] = "hybrid"
    evidence: list[EvidenceRef] = Field(default_factory=list)


class LockedSectionManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: MachineIdentity
    sections: list[LockedSection]
    expected_total_part_count: int | None = Field(default=None, ge=0)
    human_decisions: list[HumanReviewDecision] = Field(default_factory=list)
    retrieval_state: RetrievalState = RetrievalState.SECTIONS_LOCKED

    @model_validator(mode="after")
    def require_sections(self) -> "LockedSectionManifest":
        if not self.sections:
            raise ValueError("locked manifest requires at least one selected section")
        return self


class PartRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_id: str
    section_name: str
    callout_number: str | None = None
    original_part_number: str | None = None
    current_service_part_number: str
    part_title: str | None = None
    description: str
    quantity: int | None = Field(default=None, ge=0)
    status: str | None = None
    availability: str | None = None
    superseded_by: str | None = None
    replacement_note: str | None = None
    source_url: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    requires_hitl: bool = True

    @field_validator("current_service_part_number")
    @classmethod
    def part_number_required(cls, value: str) -> str:
        normalized = "".join(ch for ch in value.upper() if ch.isalnum() or ch == "-")
        if not normalized:
            raise ValueError("current_service_part_number cannot be empty")
        return normalized

    @model_validator(mode="after")
    def classify_hitl_need(self) -> "PartRow":
        has_section = bool(self.section_id and self.section_name)
        has_evidence = bool(self.source_url or self.evidence)
        self.requires_hitl = self.confidence < 0.92 or not has_section or not has_evidence
        return self


class PriceObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    part_number: str
    source: SourceProvider | str
    price: float | None = Field(default=None, ge=0)
    currency: str = "USD"
    availability: str | None = None
    price_url: str | None = None
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    requires_hitl: bool = True

    @model_validator(mode="after")
    def validate_price_source(self) -> "PriceObservation":
        has_price = self.price is not None and self.price > 0
        has_source = bool(self.source and self.price_url)
        self.requires_hitl = self.confidence < 0.92 or not has_price or not has_source
        return self


class SectionExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: MachineIdentity
    section: LockedSection
    parts: list[PartRow] = Field(default_factory=list)
    prices: list[PriceObservation] = Field(default_factory=list)
    expected_part_count: int | None = Field(default=None, ge=0)
    found_part_count: int = Field(default=0, ge=0)
    priced_part_count: int = Field(default=0, ge=0)
    missing_price_count: int = Field(default=0, ge=0)
    section_state: SectionState = SectionState.PARTS_PARTIAL
    extraction_method: Literal["deterministic_parser", "programmatic_parser", "ai_from_locked_section", "hybrid"] = "hybrid"
    errors: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def rollup_counts(self) -> "SectionExtractionResult":
        self.found_part_count = len({part.current_service_part_number for part in self.parts})
        priced = {price.part_number for price in self.prices if price.price is not None and price.price > 0}
        self.priced_part_count = len(priced)
        self.missing_price_count = max(self.found_part_count - self.priced_part_count, 0)

        expected = self.expected_part_count or self.section.expected_part_count
        if expected is None:
            self.section_state = SectionState.UNKNOWN_EXPECTED_COUNT
        elif self.found_part_count == 0:
            self.section_state = SectionState.PARTS_MISSING
        elif self.found_part_count < expected:
            self.section_state = SectionState.PARTS_PARTIAL
        elif self.missing_price_count > 0:
            self.section_state = SectionState.PRICING_PARTIAL
        else:
            self.section_state = SectionState.COMPLETE
        return self


class HitlReviewPacket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    packet_id: str
    identity: MachineIdentity
    retrieval_state: RetrievalState = RetrievalState.HITL_REVIEW_REQUIRED
    candidate_sources: list[CandidateSource] = Field(default_factory=list)
    candidate_sections: list[CandidateSection] = Field(default_factory=list)
    low_confidence_parts: list[PartRow] = Field(default_factory=list)
    low_confidence_prices: list[PriceObservation] = Field(default_factory=list)
    existing_counts: dict[str, int | None] = Field(default_factory=dict)
    failure_reason: str | None = None
    recommended_action: str | None = None
    human_decisions: list[HumanReviewDecision] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MasterBomLedgerRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row_number: int
    current_service_part_number: str
    original_part_numbers: list[str] = Field(default_factory=list)
    part_title: str | None = None
    description: str
    sections_seen: list[str]
    callout_numbers_seen: list[str] = Field(default_factory=list)
    status: str | None = None
    availability: str | None = None
    selected_price: float | None = None
    selected_price_source: str | None = None
    selected_price_url: str | None = None
    all_price_observations: list[PriceObservation] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)
    evidence_quality: EvidenceQuality = EvidenceQuality.NONE
    requires_hitl: bool = False


class MasterBomLedger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: MachineIdentity
    expected_total_part_count: int | None = Field(default=None, ge=0)
    expected_count_source: str | None = None
    rows: list[MasterBomLedgerRow]
    section_results: list[SectionExtractionResult] = Field(default_factory=list)
    retrieval_state: RetrievalState
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def validate_completion(self) -> "MasterBomLedger":
        if self.retrieval_state == RetrievalState.MODEL_COMPLETE:
            if self.expected_total_part_count is None:
                raise ValueError("model_complete requires expected_total_part_count")
            if len(self.rows) < self.expected_total_part_count:
                raise ValueError("model_complete requires row count >= expected_total_part_count")
            if any(row.selected_price is None for row in self.rows):
                raise ValueError("model_complete requires pricing status for every row")
        return self
