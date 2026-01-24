export default function PrivacyPage() {
    return (
        <div className="min-h-screen pt-20 px-6 max-w-4xl mx-auto text-gray-300">
            <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
            <div className="space-y-4">
                <p>Last updated: {new Date().toLocaleDateString()}</p>
                <p>
                    At FinManage, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal information.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">1. Information We Collect</h2>
                <p>
                    We collect information you provide directly to us, such as your name, email address, and financial data (expenses, portfolio holdings) that you input into the application.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">2. How We Use Your Information</h2>
                <p>
                    We use your information to provide, maintain, and improve our services, including analyzing your financial data to provide AI-powered insights.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">3. Data Security</h2>
                <p>
                    We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.
                </p>

                <h2 className="text-xl font-semibold text-white mt-8">4. Contact Us</h2>
                <p>
                    If you have any questions about this Privacy Policy, please contact us.
                </p>
            </div>
        </div>
    );
}
