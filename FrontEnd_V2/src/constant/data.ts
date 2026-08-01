export const DEFAULTS = {
    DEFAULT_INDIAN_LOCATION: {
        latitude: 28.6139,
        longitude: 77.209,
    },
};

export const ONBOARDING_FOUNDATION = {
    MIN_YEAR: 1900,
    MONTH_OPTIONS: [
        { value: "1", label: "January" },
        { value: "2", label: "February" },
        { value: "3", label: "March" },
        { value: "4", label: "April" },
        { value: "5", label: "May" },
        { value: "6", label: "June" },
        { value: "7", label: "July" },
        { value: "8", label: "August" },
        { value: "9", label: "September" },
        { value: "10", label: "October" },
        { value: "11", label: "November" },
        { value: "12", label: "December" },
    ],
    DAY_OPTIONS: Array.from({ length: 31 }, (_, i) => String(i + 1)),
};