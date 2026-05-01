export type SmokeTestCase = {
  key: string;
  label: string;
  brand: string;
  model: string;
  type: "dryer" | "washer" | "dishwasher" | "refrigerator";
  expectedStatus?: string;
};

export const SMOKE_TEST_CASES: SmokeTestCase[] = [
  {
    key: "dryer-samsung",
    label: "Samsung Dryer",
    brand: "Samsung",
    model: "DV45H7000EW/A2",
    type: "dryer",
  },
  {
    key: "washer-lg",
    label: "LG Washer",
    brand: "LG",
    model: "WM3400CW",
    type: "washer",
  },
  {
    key: "dryer-ge",
    label: "GE Dryer",
    brand: "GE",
    model: "GTD42EASJ2WW",
    type: "dryer",
  },
  {
    key: "washer-whirlpool",
    label: "Whirlpool Washer",
    brand: "Whirlpool",
    model: "WTW5000DW1",
    type: "washer",
  },
];
