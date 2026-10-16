import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { POLICY_VERSION } from '@larosentry/contracts';

// Set only after legal/business approval; a date alone does not approve publication.
export const POLICY_EFFECTIVE_DATE: string | null = null;
const pages: Record<string, { title: string; sections: [string, string][] }> = {
  '/how-it-works': {
    title: 'How booking works',
    sections: [
      [
        'Find a place to play',
        'Browse facilities by sport, area, price and amenities. Compare courts and inspect the individual court schedule. Listings marked fictional demonstration are for testing only: do not travel to their addresses or send money. Administrative listing approval is not a safety inspection or a guarantee of the operator.',
      ],
      [
        'Check court availability',
        'Choose a court, date and time. Times are shown in Philippine time (PHT). Confirmed reservations and facility closures affect availability. Availability can change while you browse; refresh before submitting. A free time on the schedule is not a hold.',
      ],
      [
        'Review the price and request',
        'Create an account, declare that you are at least 18 and verify your email. Review the quoted price, duration and facility cancellation policy before sending a request. The application calculates prices in Philippine pesos and records the accepted quote with the booking. If the price or policy changes before submission, review the new quote.',
      ],
      [
        'Pending is not confirmed',
        'PENDING means the facility has received a request. It does not reserve the court; other pending requests may overlap. Authorized facility staff must approve it. Check for CONFIRMED in My bookings before travelling or arranging payment. Pending requests expire after 24 hours or at the requested start, whichever comes first. A rejected or expired request does not reserve time.',
      ],
      [
        'Arrange payment with the facility',
        'LaroSentry does not collect card details, transfer money or issue refunds. Arrange payment directly with the facility using its agreed method. An operator may record an external payment in the booking; that record is not a payment transaction performed by LaroSentry. For fictional demonstrations, use test records only and never pay.',
      ],
      [
        'Changes and cancellations',
        'Review the cancellation policy saved with your booking. Use the available cancellation control before the scheduled start; cancellation does not automatically refund an external payment. Ask the facility about refunds. Eligible reschedule requests keep the original time until approved and must meet the displayed court, duration, price and policy conditions. Read the booking timeline to confirm the outcome.',
      ],
      [
        'Choose participation carefully',
        'A booking can remain private, invite specific registered users, or be explicitly published as a public game visible to signed-in users. Organizers review join requests and manage capacity, including offline guests. An invitation or join request does not itself approve attendance. Do not put private contact details in game rules.',
      ],
      [
        'Arrive and check in',
        'Open your confirmed booking for an eligible QR code. Keep it private; replacing it invalidates the previous code. Authorized facility staff can scan it or check the reference within the permitted arrival window. Check-in records attendance, not payment or completion. If scanning fails, show the booking reference to staff.',
      ],
    ],
  },
  '/help': {
    title: 'Help & contact',
    sections: [
      [
        'Where do I find my booking?',
        'Sign in and open My bookings. Review the status and timeline, court, time, price and reference. PENDING is awaiting staff approval; CONFIRMED reserves the court. If a submission loses connectivity, use the recovery or retry control on the same form before making a new request.',
      ],
      [
        'Why is my requested time unavailable?',
        'Another booking may have been confirmed or the facility may have closed the court. Refresh availability and choose a different time. A pending request never guarantees the slot. Only the facility can approve its requests; support cannot promise approval.',
      ],
      [
        'I cannot sign in or receive email',
        'Check the email spelling and spam folder. Use Forgot password for account recovery and open only the latest valid link. Verification links expire. MFA users should use their authenticator or an unused recovery code. Never send a password, OTP or recovery code in a report. An account restriction may require administrator review.',
      ],
      [
        'Payments, cancellations and refunds',
        'Review the booking policy and contact the facility through the channel you used to arrange payment. The application stores external payment records but does not move or refund money. Cancellation and a refund are separate actions. Include the booking reference in a concern, never card or bank credentials.',
      ],
      [
        'For facility operators',
        'Apply through Facility applications after signing in. Respond to clarification requests in that workspace. Only an approved application can publish a listing. Owner and assigned staff operations require MFA and facility permissions. Use the booking queue for decisions, closure controls for unavailable time, and attendance tools for check-in. Staff assignment and listing changes currently require operator-assisted administration; there is no self-service staff invitation or full listing editor.',
      ],
      [
        'Submit and track a support concern',
        'The signed-in report form accepts general account, facility, conduct, privacy and security concerns. Choose Other for a booking question and include its reference, approximate time and a concise description. After a successful submission, the report appears in My reports with a reference and status. Authorized administrators review it and record a response there. This is a working in-app channel, not a live chat or a promise of an email reply.',
      ],
      [
        'Contact channel pending setup',
        'A public support email, telephone number and unauthenticated contact service have not been configured. If you cannot sign in, online support intake is currently unavailable. No message is sent by visiting this page. Response hours and targets remain pending setup. This service is not an emergency contact channel.',
      ],
    ],
  },
  '/privacy': {
    title: 'Privacy notice',
    sections: [
      [
        'Who handles your information',
        'This publication draft describes the current LaroSentry application. The legal operator, privacy contact and business contact details are pending approval. Those details and the legal bases for processing must be completed before public launch. This notice is not a claim of legal compliance.',
      ],
      [
        'Account and security data',
        'The application stores your email, private encrypted Philippine mobile number, verification timestamps, nickname, password hash, adult declaration, policy versions and account creation time. Verification/recovery tokens and SMS codes are hashed; the local SMS simulator temporarily encrypts a test code until use or expiry. Sessions, restrictions and encrypted MFA secrets support account security. Optional player preferences include sports, broad areas, playing times, court type, hourly budget and goals. These support simple recommendations, never restrict search, and can be skipped or changed. No precise GPS is required for preferences. We do not collect payment-card credentials.',
      ],
      [
        'Booking, facility and participation data',
        'Saved facilities, booking references, court times, price and policy snapshots, cancellation and change history, attendance and operator-entered external payment records support booking operations. Applications contain facility addresses, coordinates, court details and applicant messages. Games include organizer nicknames, rules, capacity, join decisions, blocks and invitation recipients. Reports contain your submitted details and review responses. Provide only information needed for the request.',
      ],
      [
        'Why and who can access it',
        'Information is used to authenticate accounts, deliver account messages, manage requested bookings and participation, review applications and concerns, and investigate service or security problems. Facility owners and assigned staff can access information necessary for their permitted facility operations. Explicitly authorized administrators review reports, accounts and security records. Users can view their own records and permitted game information. Public court availability does not display the booking customer identity.',
      ],
      [
        'Public games and your choices',
        'Facility listing details are public after approval. Public games are visible to signed-in users only after explicit publication and show the organizer nickname, court, time, rules and capacity. Participant rosters and private invitations require authorization. Choose a nickname and rules that do not reveal information you want kept private. Notification preferences and optional profile settings are available in account settings.',
      ],
      [
        'Browser storage, location and maps',
        'Session and CSRF cookies support sign-in and request protection. Browser storage holds convenience data such as comparisons and booking drafts; clear it on shared devices. Location permission is optional: manual search works without it, and the current location stays on the page rather than being continuously tracked. Choosing map view loads OpenStreetMap tiles, whose provider receives normal network information such as your IP address. Review that provider’s privacy policy before enabling maps.',
      ],
      [
        'Facility verification evidence',
        'Facility applicants submit contact/facility details, their relationship to the facility, one supported government ID image, facility photos and appropriate authority/business evidence. Managers and representatives must provide authorization evidence; owners may explain why a supporting document is not applicable. We do not extract ID numbers or every detail from an ID. Images are sanitized, encrypted and private. Only the assigned authorized admin reviewer can retrieve them for verification review; players, staff and other owners cannot. Uploading evidence does not prove authenticity. Documents are not used for advertising or recommendations. The local workflow has not established production readiness or legal compliance.',
      ],
      [
        'Service providers and international processing',
        'The local setup uses PostgreSQL and Mailpit on the operator’s computer for data and captured test emails. It is not a production email service. OpenStreetMap is the optional external map provider. Production hosting, email delivery providers, processing locations, processor agreements and any international transfer safeguards remain to be selected and disclosed before launch.',
      ],
      [
        'Security records',
        'Audit history records relevant actors, actions, outcomes, reasons, references and times. Rules-based alerts reference selected events for human review. The application avoids logging passwords, OTPs, session tokens and full sensitive request bodies. Deployment-level network logs and their access and retention must be reviewed when hosting is selected. Alerts are not proof of misconduct.',
      ],
      [
        'Retention and deletion',
        'Private facility-verification images expire after 30 days and within seven days of approval/rejection, whichever comes first. Expired files are immediately unavailable through the API; a maintenance job removes encrypted content and retains minimal audit metadata. Inactive unsubmitted drafts have their data/images cleared after 30 days. Local SMS test codes are removed on use or expiry. This is not a complete account-erasure processor: account deletion requests remain subject to manual review, and existing encrypted backups require operator expiry/deletion management. Broader record and backup retention still needs deployment/business approval.',
      ],
      [
        'Requests and concerns',
        'Use My reports with Privacy concern to request access, correction, review of processing, or assistance with a deletion request. Describe the relevant record without attaching identity documents or secrets. Requests require identity and scope checks; statutory rights and applicable exceptions should be assessed individually. The alternative channel for users unable to sign in is pending setup. You may consult the National Privacy Commission about Philippine data privacy rights and complaints.',
      ],
    ],
  },
  '/terms': {
    title: 'Terms of use',
    sections: [
      [
        'Scope and operator',
        'These publication-draft terms describe LaroSentry’s current booking and participation service. The legal operator, business address and approved contact details are pending setup. Do not treat this draft as an approved commercial agreement. Nothing here is intended to exclude rights or remedies that applicable law does not allow to be excluded.',
      ],
      [
        'Eligibility and account responsibility',
        'Accounts require a declaration that you are at least 18, an email address you control and email verification. This is a declaration, not identity or age verification. Provide accurate information, use your own account, protect your password and recovery codes, and report suspected compromise. Privileged accounts must complete MFA. Do not create accounts for minors or share privileged access.',
      ],
      [
        'Facility listings',
        'Operators are responsible for accurate listing details, authority to offer the facility, court schedules, prices and policies. Administrative approval permits publication; it does not certify safety, licensing, availability or service quality. Clearly labeled fictional facilities are demonstrations, not real offers. Confirm practical arrangements with the facility before travelling.',
      ],
      [
        'Booking requests and confirmation',
        'Submitting a request records your preferred court and time but does not reserve it. Only authorized facility approval changes a request to CONFIRMED. Requests may be rejected or expire, and pending requests can overlap. Review the booking status and timeline. LaroSentry records and coordinates the workflow; the facility provides the venue and on-site service.',
      ],
      [
        'Prices and payment arrangements',
        'Review the displayed Philippine peso quote and the policy snapshot before submission. A changed quote requires review. Payment is arranged directly with the facility; LaroSentry currently has no payment gateway. Staff-entered payment records are records of external arrangements and do not establish that LaroSentry received funds. Taxes, receipts, deposits and any additional charges must be clarified by the operator before commercial launch and disclosed before a customer commits.',
      ],
      [
        'Cancellations, changes and refunds',
        'Use the controls available for the booking and review its recorded facility policy. Eligible rescheduling keeps the original reservation until the facility approves the change. Cancellation does not trigger an automatic refund. Request any refund from the facility that received payment. Applicable consumer rights remain relevant even if a facility policy states otherwise; unresolved concerns can be reported for review.',
      ],
      [
        'Participation and attendance',
        'Organizers choose private, invitation-based or explicitly public participation, review join requests and manage capacity. Participants must receive the required approval and follow facility rules. A game join request is not a separate court reservation. Keep QR codes and invitation links private. Staff check-in records attendance; it does not confirm payment, determine refunds or guarantee participant safety.',
      ],
      [
        'Conduct and prohibited activity',
        'Respect other players and facility staff. Harassment, impersonation, discriminatory abuse, fraud, malicious content, unauthorized access, password attacks, scraping private information and disruption are prohibited. Do not probe systems without explicit authorization. Follow the Security & acceptable use page and report concerns with only necessary evidence.',
      ],
      [
        'User content and reviews',
        'You are responsible for text you submit, including game rules, applications and reports. Submit material you have permission to use, avoid unnecessary personal information, and do not post unlawful or misleading content. Information may be shown to the audiences needed to operate the selected feature. Customer review submission and ratings are not currently available; no testimonial or score should be inferred from a listing.',
      ],
      [
        'Facility-operator responsibilities',
        'Use only authorized accounts and assigned permissions. Review requests promptly, keep availability accurate, explain rejection and cancellation decisions, record external payments truthfully, and protect customer information. Operators handle venue safety, access, on-site service, payment receipts and refund decisions subject to applicable obligations. Platform access does not replace business licenses or other legal requirements.',
      ],
      [
        'Service availability and restrictions',
        'Maintenance, network failures and operational issues can interrupt access. No uninterrupted-service guarantee or response-time commitment is currently offered. Restrictions require administrative review and a recorded reason; they are not automatically imposed from an alert alone. Restrictions can prevent sign-in or actions and can be reviewed and reversed. Use the available support process to seek review; the inaccessible-account contact channel is still pending setup.',
      ],
      [
        'Disputes and support',
        'For venue delivery or external payment issues, first seek clarification from the facility using your booking reference. Submit an in-app report for an account, listing, privacy or conduct concern and track the recorded response. The application supports review, not a court or binding arbitration service. Public contact details, escalation ownership and response targets must be approved before launch. These terms do not prevent access to applicable lawful remedies.',
      ],
      [
        'Changes and acceptance',
        'Registration links to these terms and the privacy notice and records the policy bundle version accepted at registration. The effective date below will be set only after approval. Material changes need an approved notice and, where appropriate, renewed acceptance process before deployment; that process is not yet automated. Existing acceptance records are preserved and are not silently relabeled as acceptance of a new version.',
      ],
    ],
  },
  '/security': {
    title: 'Security & acceptable use',
    sections: [
      [
        'Protect your account',
        'Use a unique password and verify the site address before signing in. Keep passwords, OTPs and recovery codes private. Sign out on shared devices and review active sessions in account settings. If you suspect compromise, change your password and report the concern.',
      ],
      [
        'Privileged access',
        'Administrators, facility owners and staff need MFA for privileged operations. Use an individual authorized account and only the information needed for your assigned work. An email domain does not grant administrative permission. Protect authenticator backups and store recovery codes securely.',
      ],
      [
        'Respect other people’s information',
        'Do not copy or expose private bookings, contact details, attendance, invitation links or security records. Keep personal information out of public game rules. Facility personnel must use customer information only for legitimate facility operations and authorized review.',
      ],
      [
        'Prohibited access and abuse',
        'Unauthorized access, password guessing, bypassing permissions, impersonation, harassment, fraudulent reports, disruptive traffic and scraping private records are prohibited. Finding a weakness or a public page does not authorize testing or accessing someone else’s data. Obtain explicit permission before security testing.',
      ],
      [
        'Report a suspected issue safely',
        'Stop if you encounter private information. Record the affected page, approximate time and a concise description of what you observed. Do not send secrets, exploit attachments or copied private records. Sign in to My reports and choose Security concern or Privacy concern. Track the reference and response there. An alternative channel for people unable to sign in is pending setup; this is not an emergency service.',
      ],
      [
        'Fair review',
        'Authorized administrators review reports and supporting information, record decisions and reasons, and can review restrictions. An accusation or security alert is not proof that someone attacked the service. The system does not automatically punish accounts solely from alert thresholds. Report honestly and avoid public allegations or disclosure of another person’s information.',
      ],
    ],
  },
  '/list-your-facility': {
    title: 'A simpler game plan for your facility',
    sections: [
      [
        'Apply to list your courts',
        'Sign in and open Facility applications to submit your facility, first court, opening hours, price and cancellation policy. Confirm that you are authorized to provide the details. Submission does not publish a listing.',
      ],
      [
        'Respond to review',
        'Administrators can ask for clarification, approve or reject with a reason. Read the response and reply from your application history. Approval enables a public listing and owner access; it is not a safety or business certification.',
      ],
      [
        'Manage the day’s bookings',
        'Enroll MFA for owner access. Review requests, manage closures, record external payments and check attendance. Assigned staff use facility-scoped permissions. Contact support through My reports for assistance with account or listing concerns.',
      ],
    ],
  },
};
export default function Information() {
  const { pathname } = useLocation();
  const page = pages[pathname]!;
  const policy = pathname === '/terms' || pathname === '/privacy';
  useEffect(() => {
    document.title = `${page.title} | LaroSentry`;
    return () => {
      document.title = 'LaroSentry — Make room for play';
    };
  }, [page.title]);
  return (
    <article className="container section legal-copy">
      <span className="eyebrow dark">LAROSENTRY · INFORMATION</span>
      <h1>{page.title}</h1>
      {policy && (
        <p className="notice">
          Publication draft · Version {POLICY_VERSION} · Effective date:{' '}
          {POLICY_EFFECTIVE_DATE ?? 'Pending approval'}. Business and legal review required before public
          launch.
        </p>
      )}
      <nav className="policy-nav" aria-label="Information pages">
        {Object.entries(pages)
          .filter(([path]) => path !== '/list-your-facility')
          .map(([path, value]) => (
            <Link key={path} to={path} aria-current={pathname === path ? 'page' : undefined}>
              {value.title}
            </Link>
          ))}
      </nav>
      <nav aria-label="On this page">
        <ul>
          {page.sections.map(([title], i) => (
            <li key={title}>
              <a href={`#section-${i}`}>{title}</a>
            </li>
          ))}
        </ul>
      </nav>
      {page.sections.map(([title, content], i) => (
        <section id={`section-${i}`} key={title}>
          <h2>{title}</h2>
          <p>{content}</p>
        </section>
      ))}
      {pathname === '/privacy' && (
        <p>
          Further reading:{' '}
          <a href="https://privacy.gov.ph/data-subject-rights/">
            National Privacy Commission: data subject rights
          </a>{' '}
          and{' '}
          <a href="https://osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap Foundation privacy policy</a>.
        </p>
      )}
      <div className="button-row">
        <Link className="btn" to="/app/reports">
          Submit or track a report
        </Link>
        <Link className="btn secondary" to="/facilities">
          Find a court
        </Link>
      </div>
    </article>
  );
}
