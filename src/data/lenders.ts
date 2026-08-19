// Low-interest loan lender directory — small finance banks and NBFCs that
// typically offer cheaper personal loans than big banks, plus a few large
// banks with competitive rates. Static reference data; always verify current
// rates on the lender's site.

export interface Lender {
    name: string;
    type: 'Small Finance Bank' | 'NBFC' | 'Public Bank' | 'Private Bank';
    minRate: number;   // typical starting rate (annual %)
    maxRate: number;
    processingFee: string;
    maxLoan: string;
    tenure: string;
    eligibility: string;
    notes: string;
    website?: string;
}

export const LOW_INTEREST_LENDERS: Lender[] = [
    {
        name: 'AU Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 10.25,
        maxRate: 15.5,
        processingFee: 'Up to 1.5%',
        maxLoan: '₹25 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried 21–60 yrs, min ₹15k/month income',
        notes: 'Fast digital KYC, strong for salaried personal loans; good EMI flexibility.',
    },
    {
        name: 'Equitas Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 10.99,
        maxRate: 17.0,
        processingFee: 'Up to 2%',
        maxLoan: '₹25 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried & self-employed, CIBIL 650+',
        notes: 'Competitive starting rates; car and home loans also offered.',
    },
    {
        name: 'Ujjivan Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 11.0,
        maxRate: 18.0,
        processingFee: 'Up to 2%',
        maxLoan: '₹15 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried, min ₹18k/month, CIBIL 650+',
        notes: 'Focus on affordable lending; good for first-time borrowers.',
    },
    {
        name: 'Jana Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 11.49,
        maxRate: 19.0,
        processingFee: 'Up to 1.5%',
        maxLoan: '₹10 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried & self-employed, CIBIL 600+',
        notes: 'Lower ticket sizes but lenient eligibility for thinner credit files.',
    },
    {
        name: 'Suryoday Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 12.0,
        maxRate: 18.0,
        processingFee: 'Up to 2%',
        maxLoan: '₹10 Lakh',
        tenure: '12–48 months',
        eligibility: 'Salaried, CIBIL 650+',
        notes: 'Emerging player; micro and personal loans with quick approvals.',
    },
    {
        name: 'Capital Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 11.75,
        maxRate: 16.5,
        processingFee: 'Up to 1%',
        maxLoan: '₹20 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried in tier-2/3 cities, CIBIL 650+',
        notes: 'Strong in North India; low processing fees.',
    },
    {
        name: 'North East Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 12.5,
        maxRate: 18.0,
        processingFee: 'Up to 1.5%',
        maxLoan: '₹10 Lakh',
        tenure: '12–48 months',
        eligibility: 'Salaried/self-employed in North-East India',
        notes: 'Regional focus; competitive rates within its footprint.',
    },
    {
        name: 'Shivalik Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 11.0,
        maxRate: 17.5,
        processingFee: 'Up to 1%',
        maxLoan: '₹15 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried, CIBIL 650+',
        notes: 'Low fees and quick disbursal for personal loans.',
    },
    {
        name: 'Utkarsh Small Finance Bank',
        type: 'Small Finance Bank',
        minRate: 12.0,
        maxRate: 18.5,
        processingFee: 'Up to 2%',
        maxLoan: '₹10 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried & self-employed, CIBIL 600+',
        notes: 'Good for rural/semi-urban borrowers; doorstep service.',
    },
    {
        name: 'SBI (Xpress Credit)',
        type: 'Public Bank',
        minRate: 10.25,
        maxRate: 14.0,
        processingFee: 'Up to 0.75%',
        maxLoan: '₹20 Lakh',
        tenure: '12–72 months',
        eligibility: 'Salaried with existing SBI account',
        notes: 'Lowest big-bank rates for existing customers; instant offers on YONO.',
    },
    {
        name: 'HDFC Bank',
        type: 'Private Bank',
        minRate: 10.5,
        maxRate: 21.0,
        processingFee: 'Up to 2%',
        maxLoan: '₹40 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried, CIBIL 700+',
        notes: 'Wide availability; pre-approved offers for salary-account holders.',
    },
    {
        name: 'ICICI Bank',
        type: 'Private Bank',
        minRate: 10.75,
        maxRate: 19.0,
        processingFee: 'Up to 2.25%',
        maxLoan: '₹30 Lakh',
        tenure: '12–60 months',
        eligibility: 'Salaried, CIBIL 700+',
        notes: 'Strong digital onboarding; instant approval for existing customers.',
    },
    {
        name: 'Bajaj Finserv',
        type: 'NBFC',
        minRate: 10.99,
        maxRate: 24.0,
        processingFee: 'Up to 3.5%',
        maxLoan: '₹40 Lakh',
        tenure: '12–96 months',
        eligibility: 'Salaried, CIBIL 650+',
        notes: 'Flexi loans with pre-approved offers; high fees — compare total cost.',
    },
];
