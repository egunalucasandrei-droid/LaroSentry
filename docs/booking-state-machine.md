# Booking rules

| From                | To                  | Actor and condition                                                                           |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| PENDING             | CONFIRMED           | Assigned booking operator + MFA; not expired; policies, price, hours and allocation rechecked |
| PENDING             | REJECTED            | Assigned booking operator + MFA, with reason; or another overlapping request wins             |
| PENDING             | EXPIRED             | Maintenance after the earlier of request+24h and requested start                              |
| PENDING / CONFIRMED | CANCELLED           | Organizer, before start; release allocation and revoke QR                                     |
| CONFIRMED           | COMPLETED / NO_SHOW | Assigned booking operator + MFA, after end                                                    |

Other transitions are rejected. Check-in is an independent attendance record; it never changes a confirmed booking to completed. Pending requests can overlap one another. Confirmation inserts an active allocation inside the same transaction and notifies/rejects affected pending requests. The exclusion constraint is the final concurrency authority. A losing concurrent transaction returns a conflict and must refresh.

Times are stored UTC and displayed Asia/Manila. Initial bookings are 1–4 hours in 30-minute increments, within the facility's simple daily hours and the next 90 days. Guest count includes the organizer. Money is integer centavos with hourly-rate and policy snapshots.

A booking request carries a UUID Idempotency-Key and the quoteFingerprint returned by price review. Reusing a key with the same user/request returns the same booking; different details return conflict. A changed price or policy requires fresh review. The frontend persists the submission key for unchanged details across reload and provides a scoped submission lookup after ambiguous network errors. Safe draft inputs survive login in sessionStorage; session secrets do not.

Cancellation does not execute a refund. Initial payment support is one staff-verified full external payment, after confirmation, with an immutable attributable record. Partial payment/refund correction workflows are not implemented.

Closure allocations use the same exclusion constraint and cannot silently displace confirmed bookings. Assigned operators can create/reopen closures. Organizers may request a same-price, same-duration, same-policy change on an upcoming confirmed booking; operators approve or reject. A failed change preserves the original allocation. Approval moves the allocation atomically and revokes previous QR codes.

## Community participation

All three reservation modes are available. PUBLIC remains unpublished until the organizer explicitly publishes after facility confirmation. PRIVATE is accessible only to the organizer, authorized participants and unexpired intended invitees. BOOKING_ONLY has no online participation.

Capacity includes the organizer (one), offline guests and APPROVED participants. REQUESTED players and pending invitations reserve no place. Approvals and invitation acceptance lock the booking before counting and updating capacity. The unique booking/user constraint prevents duplicate participation.

Public requests progress REQUESTED -> APPROVED or REJECTED. A player may withdraw/leave to LEFT before start. LEFT players may request again; REJECTED requests cannot be repeatedly resubmitted. Organizers may remove an approved place. Private invitation acceptance gives an approved place only if one is available. Invitations expire within 48 hours or by start, are recipient-bound and revocable; in-app acceptance uses the authenticated intended account, while an optionally submitted email token must also match. A token alone never authorizes access.

Changing mode requires resolving active requests, approved players and unexpired invitations first. Unpublishing alone stops new public requests and preserves existing participation. Blocking prevents new interactions in either direction; it does not silently cancel existing places. Cancellation unpublishes, revokes pending invitations and notifies existing participants. Participants receive in-app schedule/status notifications and can inspect the current game status without accessing the organizer's full booking or payment records.
