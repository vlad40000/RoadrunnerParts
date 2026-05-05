/**
 * This file implements the blocking logic defined in PROMPT_ENGINEERING_STANDARD.md
 */
export const BRAND_SOURCE_GATE = {
    LG: {
        forbidden: ['samsung.com', 'bosch-home.com', 'hisense-usa.com'],
        approved: ['encompass.com', 'lg.com']
    },
    GE: {
        forbidden: ['bosch-home.com', 'samsung.com'],
        approved: ['geapplianceparts.com', 'sears_partsdirect']
    }
    // Additional brand mappings...
};