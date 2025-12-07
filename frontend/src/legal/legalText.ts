export type LegalDocKey = "terms" | "privacy" | "data";

interface LegalDocDefinition {
  title: string;
  lastUpdatedLabel: string;
  body: string;
}

export const LEGAL_DOCS: Record<LegalDocKey, LegalDocDefinition> = {
  terms: {
    title: "Velo Sports App Terms of Service",
    lastUpdatedLabel: "Last updated: December 5, 2025",
    body: `Velo Sports App Terms of Service

Last updated: December 5, 2025

1. Agreement to Terms

These Terms of Service (“Terms”) govern your access to and use of the Velo Sports mobile and web applications and any related services (collectively, the “App”), operated by Velo Sports, LLC, a Delaware company (“Velo Sports,” “we,” “us,” or “our”). By accessing or using the App, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the App.

2. Eligibility

You must be at least 13 years old, or the age of majority in your jurisdiction if higher, to use the App. By using the App, you represent and warrant that you meet this requirement and that you have the legal capacity to enter into these Terms.

3. Account Registration and Security

To use certain features of the App, you may be required to create an account. You agree to provide accurate, current, and complete information during registration and to keep your account information up to date. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify us promptly of any unauthorized use of your account.

4. License and App Use

Subject to your compliance with these Terms, Velo Sports grants you a limited, non‑exclusive, non‑transferable, revocable license to access and use the App for your personal, non‑commercial training and informational purposes.

Except as expressly permitted by these Terms, you agree not to:
• Copy, modify, or create derivative works of the App.
• Reverse engineer, decompile, or disassemble any portion of the App.
• Circumvent or attempt to circumvent any security or access control measures.
• Use the App in any manner that violates applicable law or infringes the rights of others.

5. Performance Data and User Content

When you use the App, it generates performance‑related data such as bat speed, exit velocity, and other assessment metrics (“Performance Data”). You may also provide feedback, comments, or other content (collectively, “User Content”).

You retain all rights in your Performance Data and User Content. By using the App, you grant Velo Sports a non‑exclusive, worldwide, royalty‑free license to use, reproduce, display, and analyze your Performance Data and User Content as reasonably necessary to operate, maintain, and improve the App and our services.

You are free to use, export, and share your Performance Data in any form you choose, including by taking screenshots, sharing on social media, or using the data, screens, or images produced by the App for your own purposes.

6. Data Privacy and Security

Our collection and use of personal information and Performance Data are described in our Privacy Policy and Data Usage Policy, which are incorporated into these Terms by reference. By using the App, you acknowledge that you have read and understood these policies.

7. Prohibited Conduct

You agree not to use the App to:
• Engage in any unlawful, misleading, or fraudulent activity.
• Upload or transmit any viruses, malware, or other harmful code.
• Harass, threaten, or harm another person.
• Infringe or violate the intellectual property, privacy, or other rights of any third party.
• Attempt to gain unauthorized access to the App, other users’ accounts, or our systems.

8. Health and Safety Disclaimer

The App is designed to provide training information and performance metrics only. It does not provide medical advice, diagnosis, or treatment. You are responsible for your own training decisions and physical condition. Consult with appropriate medical or professional advisers before beginning any new training program or making significant changes to your physical activity. Use the App at your own risk.

9. Third‑Party Services

The App may reference or link to third‑party websites, products, or services that are not owned or controlled by Velo Sports. We are not responsible for the content, policies, or practices of any third‑party services, and your use of such services is at your own risk and subject to the terms and policies of those third parties.

10. Disclaimers

To the maximum extent permitted by law, the App is provided on an “AS IS” and “AS AVAILABLE” basis, without warranties of any kind, whether express or implied. Velo Sports disclaims all warranties, including any implied warranties of merchantability, fitness for a particular purpose, and non‑infringement, and any warranties arising out of course of dealing or usage of trade. We do not warrant that the App will be uninterrupted, error‑free, or secure, or that any results or improvements will be achieved by using the App.

11. Limitation of Liability

To the maximum extent permitted by law, in no event will Velo Sports, its affiliates, or their respective owners, directors, officers, employees, or agents be liable for any indirect, incidental, consequential, special, or punitive damages, or for any loss of profits or revenues, arising out of or related to your use of or inability to use the App, whether based on warranty, contract, tort (including negligence), product liability, or any other legal theory, even if we have been advised of the possibility of such damages.

Our total aggregate liability for any claim arising out of or relating to the App or these Terms will not exceed the greater of (a) the amount you have paid to us, if any, for use of the App during the six (6) months preceding the event giving rise to the claim, or (b) one hundred U.S. dollars (US $100).

12. Indemnification

You agree to indemnify, defend, and hold harmless Velo Sports, its affiliates, and their respective owners, directors, officers, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to: (a) your use of the App; (b) your violation of these Terms; or (c) your violation of any rights of another person or entity.

13. Termination

We may suspend or terminate your access to the App at any time, with or without notice, if we believe you have violated these Terms or if we discontinue the App. You may stop using the App at any time and may delete your account through the profile page. Upon termination, Sections that by their nature should survive (including, for example, ownership provisions, disclaimers, limitations of liability, and indemnification) will remain in effect.

14. Changes to the App and Terms

We are continually improving the App and may add, modify, or remove features at any time. We may also update these Terms from time to time. If we make material changes, we will provide notice in the App or by other reasonable means. Your continued use of the App after changes become effective constitutes your acceptance of the updated Terms.

15. Governing Law

These Terms and any disputes arising out of or relating to them or the App will be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles.

16. Contact Us

If you have any questions about these Terms, please contact us at:

Velo Sports, LLC
Email: info@velosports.com`
  },

  data: {
    title: "Velo Sports App Data Usage Policy",
    lastUpdatedLabel: "Last updated: December 5, 2025",
    body: `Velo Sports App Data Usage Policy

Last updated: December 5, 2025

1. Overview

This Data Usage Policy describes how Velo Sports, LLC (“Velo Sports,” “we,” “us,” or “our”) collects, uses, and shares the performance‑related data generated when you use the Velo Sports App.

2. Types of Data

When you use the App, we collect and generate Performance Data related to your sports activities. This may include, for example:

• Bat speed
• Exit velocity
• Metrics and data points gathered during assessments and protocol sessions
• Other similar performance or training data produced by the App

3. How Velo Sports Uses Your Data

We use your Performance Data to:

• Display performance metrics, trends, and feedback to you in the App.
• Help you monitor changes and improvements over time.
• Operate, maintain, and improve the App and our training protocols.
• Conduct internal analysis, testing, and research (for example, understanding aggregate usage patterns).
• Develop new features, tools, and services.

4. How You Can Use and Share Your Data

You are free to use and share your Performance Data in any way you choose. For example, you may:

• Take screenshots of your results.
• Share your data on social media.
• Export, store, or display your data in other applications.
• Use any data, screens, or images produced by the App for your own personal or professional purposes.

5. How Velo Sports Shares Data

Velo Sports will not share your Performance Data with any third‑party or marketing agency outside of Velo Sports, LLC or its affiliates: SuperSpeed Golf, LLC, Catalyst Golf Performance, Inc., and Strike Spray, Inc.

We may share aggregated or de‑identified information (which does not identify you personally) for purposes such as analytics, research, and improving our products and services.

6. Service Providers and Operational Uses

We may work with trusted service providers who assist us with functions such as data storage, hosting, and support. These providers may have access to your information solely to perform services on our behalf and are obligated to protect it.

7. Your Control and Account Deletion

You may update or change information in your account at any time through the profile update feature in the App. You may also delete your account through the profile page. After account deletion, we may retain certain information where required or permitted by law, or for legitimate business purposes, but your Performance Data will no longer be available to you in the App.

8. Policy Updates

We may modify this Data Usage Policy from time to time. Material changes will be communicated through the App or by other reasonable means. Your continued use of the App after changes become effective constitutes your acceptance of the updated policy.

This Data Usage Policy is intended as a general informational template and does not constitute legal advice. Please consult with your own legal counsel for guidance specific to your situation.`
  },

  privacy: {
    title: "Velo Sports App Privacy Policy",
    lastUpdatedLabel: "Last updated: December 5, 2025",
    body: `Velo Sports App Privacy Policy

Last updated: December 5, 2025

1. Introduction

Velo Sports, LLC (“Velo Sports,” “we,” “us,” or “our”) operates the Velo Sports mobile and web applications and related services (collectively, the “App”). This Privacy Policy explains how we collect, use, and protect information when you use the App.

Velo Sports, LLC is a Delaware company. If you have any questions about this Privacy Policy, you may contact us at info@velosports.com.

2. Scope

This Privacy Policy applies to information we collect through the App and any related services that link to or reference this Privacy Policy.

3. Information We Collect

We collect the following types of information:

Account Information:

When you create or update your account, you may provide information such as your name, email address, username, password, and other profile details you choose to share.

Performance and Assessment Data:

When you use the App, we collect data related to your sports performance, such as bat speed, exit velocity, and other specific metrics or data points generated during assessments, protocol sessions, and other in‑app activities (“Performance Data”).

Usage and Device Information (if collected):

We may automatically collect certain information when you use the App, such as your device type, operating system, IP address, app version, and in‑app activity (e.g., features used, session length). We use this information to help operate, secure, and improve the App.

Communications:

If you contact us directly (for example by email), we may receive your name, email address, and the content of your message.

4. How We Use Information

We use the information we collect for purposes such as:

• Creating, maintaining, and securing your account.
• Providing and operating the App and its features.
• Displaying your Performance Data and related analytics to you.
• Responding to your questions and requests.
• Monitoring and improving the App, including troubleshooting and analytics.
• Enforcing our Terms of Service and protecting the security and integrity of the App.
• Complying with legal obligations, as necessary.

5. How We Share Information

We do not sell or rent your personal information. We will not share your Performance Data with any third‑party or marketing agency outside of Velo Sports, LLC and its affiliates: SuperSpeed Golf, LLC, Catalyst Golf Performance, Inc., and Strike Spray, Inc.

We may share information in the following limited circumstances:

• With service providers who perform services on our behalf (such as cloud hosting, analytics, or technical support) and who are bound by appropriate confidentiality and data protection obligations.
• With our affiliates listed above, for purposes consistent with this Privacy Policy.
• In connection with a business transaction, such as a merger, acquisition, or asset sale, subject to appropriate confidentiality protections.
• When required by law, regulation, legal process, or governmental request, or to protect the rights, property, or safety of Velo Sports, our users, or others.

6. Your Rights and Choices

Account details are private to your account. You control and can manage your information as follows:

• Profile Updates: You may view, edit, update, or change information in your account at any time through the profile update feature in the App.
• Account Deletion: You may delete your account at any time through the profile page of the App. Deleting your account will limit access to your account information and Performance Data within the App. We may retain certain information where required or permitted by law, or for legitimate business purposes (such as security, fraud prevention, and recordkeeping).

7. Data Security

We use reasonable technical and organizational measures designed to protect your information from unauthorized access, use, or disclosure. However, no method of transmission over the internet or method of electronic storage is completely secure, and we cannot guarantee absolute security.

8. Data Retention

We retain information for as long as necessary to provide the App, to comply with our legal obligations, resolve disputes, and enforce our agreements. Where possible, we may anonymize or aggregate information so that it no longer identifies you.

9. Children’s Privacy

The App is not intended for children under the age of 13, and we do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13 without appropriate consent, we will take steps to delete such information. Accounts for children under the age of 13 must be created by a parent as a “parent account” and then the child must be invited to the account by the parent.

10. International Users

If you access the App from outside the United States, you understand that your information may be processed in the United States and other countries, which may have data protection laws different from those in your country of residence.

11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. If we make material changes, we will provide notice in the App or by other appropriate means. Your continued use of the App after any changes become effective constitutes your acceptance of the updated Privacy Policy.

12. Contact Us

If you have any questions or requests regarding this Privacy Policy or our privacy practices, please contact us at:

Velo Sports, LLC
Email: info@velosports.com`
  }
};
