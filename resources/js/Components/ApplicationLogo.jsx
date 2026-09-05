export default function ApplicationLogo(props) {
    return (
        <svg
            {...props}
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
        >
            <rect x="6" y="24" width="30" height="20" rx="10" fill="#F4D6A0" stroke="#E0A458" strokeWidth="2" />
            <path
                d="M8 28c4-6 12-10 20-10s16 4 20 10"
                stroke="#E0A458"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M38 22c0 6-8 8-8 8s-8-2-8-8"
                fill="#FBE7C0"
                stroke="#E0A458"
                strokeWidth="1.5"
            />
            <rect x="38" y="26" width="20" height="14" rx="5" fill="#FFFFFF" stroke="#5C6AC4" strokeWidth="2" />
            <path d="M56 30c4 0 4 6 0 6" stroke="#5C6AC4" strokeWidth="2" strokeLinecap="round" />
            <circle cx="48" cy="33" r="4" fill="#9C6B4F" />
            <path
                d="M18 18c-1-2-1-4 0-6"
                stroke="#C58A3E"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M24 16c-1-2-1-4 0-6"
                stroke="#C58A3E"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M30 18c-1-2-1-4 0-6"
                stroke="#C58A3E"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    );
}
