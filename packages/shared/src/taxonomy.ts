/**
 * Option lists for the profile form.
 *
 * Two rules govern everything here.
 *
 * ONE — this product is not for developers. The wedge is UK graduates and
 * international students needing sponsorship, and that cohort is overwhelmingly
 * not engineers: law and business are the two largest UK postgraduate subjects,
 * and the jobs people actually take include care work, retail, hospitality,
 * call centres and administration. A form that offers "Tech / stack" and
 * "open source" to a paralegal or a care assistant tells them, in the first
 * thirty seconds, that the product was not built for them. Every list below is
 * checked against that: if it only makes sense to a software engineer, it does
 * not belong.
 *
 * TWO — these are SUGGESTIONS, never a closed set. Every field that uses one
 * still accepts free text, because a list that cannot describe someone is worse
 * than no list. The one exception is work authorisation, which is a genuine
 * enumeration plus an explicit "Other" escape hatch.
 */

/**
 * Right to work. The one closed list in the form.
 *
 * The labels are deliberately self-describing rather than terse codes, because
 * they are the only fact the resolver can use to answer an employer's "do you
 * require sponsorship?" — the question that, unanswered, parks every UK
 * application, and that the model previously invented an answer to. "Graduate
 * visa" alone does not tell the resolver whether sponsorship is needed;
 * "Graduate visa — will need sponsorship when it expires" does.
 */
export const WORK_AUTHORIZATION_OPTIONS = [
  "British or Irish citizen — no sponsorship needed",
  "Indefinite leave to remain / settled status — no sponsorship needed",
  "EU Settlement Scheme: pre-settled status — no sponsorship needed for now",
  "Graduate visa — will need sponsorship when it expires",
  "Skilled Worker visa — would need the new employer to sponsor a transfer",
  "Student visa — limited working hours, will need sponsorship after study",
  "Dependant visa with the right to work — no sponsorship needed",
  "I need visa sponsorship to work in the UK",
  "Right to work outside the UK (not UK-based)",
  "Other",
] as const;

/** The sentinel that reveals the free-text box. */
export const WORK_AUTHORIZATION_OTHER = "Other";

/**
 * Qualifications, UK-first and deliberately not graduate-only.
 *
 * Someone applying for a call-centre or retail role may have GCSEs and nothing
 * else, and a form whose lowest rung is "Bachelor's Degree" quietly tells them
 * they do not qualify to use it.
 */
export const DEGREE_OPTIONS = [
  "GCSEs",
  "A-Levels",
  "Scottish Highers",
  "BTEC",
  "T-Level",
  "NVQ",
  "Apprenticeship",
  "Access to Higher Education Diploma",
  "Foundation Degree",
  "HNC",
  "HND",
  "BA (Hons)",
  "BSc (Hons)",
  "BEng",
  "LLB",
  "BMus",
  "BEd",
  "MA",
  "MSc",
  "MEng",
  "LLM",
  "MBA",
  "MRes",
  "PGCE",
  "PGDip",
  "PhD",
  "Professional certification",
  "Diploma",
] as const;

/** Subjects, weighted towards what UK students actually study. */
export const FIELD_OF_STUDY_OPTIONS = [
  "Law", "Business Management", "Accounting and Finance", "Economics", "Marketing",
  "Human Resources", "International Business", "Nursing", "Midwifery", "Medicine",
  "Pharmacy", "Dentistry", "Physiotherapy", "Public Health", "Social Work",
  "Psychology", "Sociology", "Criminology", "Politics", "International Relations",
  "History", "English Literature", "Modern Languages", "Journalism", "Media Studies",
  "Education", "Early Childhood Studies", "Computer Science", "Software Engineering",
  "Data Science", "Cybersecurity", "Information Systems", "Mechanical Engineering",
  "Civil Engineering", "Electrical Engineering", "Chemical Engineering", "Architecture",
  "Biomedical Science", "Biology", "Chemistry", "Physics", "Mathematics",
  "Environmental Science", "Agriculture", "Hospitality Management", "Tourism",
  "Event Management", "Sport Science", "Fashion", "Graphic Design", "Fine Art",
  "Music", "Drama", "Film Production", "Supply Chain and Logistics", "Real Estate",
  "Aviation", "Veterinary Science", "Dietetics", "Occupational Therapy",
] as const;

/**
 * Job titles across the sectors people actually work in — not a tech ladder.
 * Ordered roughly by how common they are in UK entry- and mid-level hiring.
 */
export const JOB_TITLE_SUGGESTIONS = [
  // customer-facing and service
  "Customer Service Advisor", "Call Centre Agent", "Contact Centre Team Leader",
  "Retail Assistant", "Store Manager", "Sales Assistant", "Sales Executive",
  "Account Manager", "Business Development Executive", "Receptionist",
  "Waiter / Waitress", "Barista", "Bartender", "Chef", "Kitchen Assistant",
  "Hotel Front of House", "Housekeeper", "Delivery Driver", "Warehouse Operative",
  // admin and operations
  "Administrator", "Office Manager", "Executive Assistant", "Data Entry Clerk",
  "Operations Assistant", "Operations Manager", "Project Coordinator",
  "Project Manager", "Supply Chain Coordinator", "Logistics Coordinator",
  "Procurement Assistant",
  // legal
  "Paralegal", "Legal Assistant", "Trainee Solicitor", "Solicitor", "Barrister",
  "Legal Secretary", "Compliance Officer", "Contracts Administrator",
  // finance
  "Accounts Assistant", "Bookkeeper", "Accountant", "Financial Analyst",
  "Auditor", "Payroll Administrator", "Credit Controller", "Insurance Advisor",
  "Mortgage Advisor", "Investment Analyst",
  // health and care
  "Care Assistant", "Support Worker", "Healthcare Assistant", "Registered Nurse",
  "Pharmacy Assistant", "Dental Nurse", "Physiotherapist", "Occupational Therapist",
  "Social Worker", "Mental Health Support Worker",
  // education
  "Teaching Assistant", "Primary School Teacher", "Secondary School Teacher",
  "Lecturer", "Private Tutor", "Nursery Practitioner", "Learning Support Assistant",
  // people and marketing
  "HR Assistant", "HR Advisor", "Recruitment Consultant", "Talent Acquisition Partner",
  "Marketing Assistant", "Marketing Manager", "Social Media Manager",
  "Content Writer", "Copywriter", "PR Executive", "Graphic Designer",
  // technical
  "Software Engineer", "Frontend Developer", "Backend Developer",
  "Full Stack Developer", "Data Analyst", "Data Scientist", "Business Analyst",
  "QA Engineer", "DevOps Engineer", "IT Support Technician", "Systems Administrator",
  "Product Manager", "UX Designer", "Cybersecurity Analyst",
  // trades, science, other
  "Electrician", "Plumber", "Carpenter", "Mechanic", "Engineer",
  "Laboratory Technician", "Research Assistant", "Quantity Surveyor",
  "Architect", "Estate Agent", "Security Officer", "Cleaner", "Volunteer",
] as const;

/**
 * Skills, cross-sector. A call-centre worker's "de-escalation" and a
 * paralegal's "legal research" belong here exactly as much as "TypeScript".
 */
export const SKILL_SUGGESTIONS = [
  // universal workplace
  "Customer service", "Communication", "Teamwork", "Time management",
  "Problem solving", "Attention to detail", "Conflict resolution",
  "Complaint handling", "De-escalation", "Active listening", "Telephone manner",
  "Cash handling", "Stock management", "Health and safety", "Safeguarding",
  "First aid", "Manual handling", "Food hygiene", "Rota planning",
  "Training and mentoring", "Team leadership", "Performance management",
  // office and data
  "Microsoft Excel", "Microsoft Word", "PowerPoint", "Outlook", "Google Workspace",
  "Data entry", "Diary management", "Minute taking", "Report writing",
  "Invoicing", "Bookkeeping", "Payroll", "Sage", "Xero", "QuickBooks", "SAP",
  "Salesforce", "HubSpot", "Zendesk", "CRM systems",
  // legal and compliance
  "Legal research", "Case management", "Drafting contracts", "Bundling",
  "Due diligence", "GDPR", "Compliance", "Regulatory reporting",
  // health and care
  "Patient care", "Care planning", "Medication administration",
  "Infection control", "Record keeping", "Mental health awareness",
  // languages
  "English", "Urdu", "Punjabi", "Hindi", "Arabic", "Mandarin", "Spanish",
  "French", "German", "Polish", "Romanian", "Bengali",
  // technical
  "SQL", "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java",
  "C#", "PHP", "HTML", "CSS", "Git", "AWS", "Azure", "Docker", "Linux",
  "Power BI", "Tableau", "Figma", "Photoshop", "WordPress", "Google Analytics",
  "SEO", "Social media marketing", "Copywriting", "Video editing",
] as const;

/**
 * Common UK employers and institutions worth suggesting for the school field.
 * A short, high-hit list beats an exhaustive one nobody scrolls.
 */
export const INSTITUTION_SUGGESTIONS = [
  "University of Manchester", "University of Birmingham", "University of Leeds",
  "University College London", "King's College London", "Queen Mary University of London",
  "University of Nottingham", "University of Sheffield", "University of Liverpool",
  "Coventry University", "University of Westminster", "City, University of London",
  "Manchester Metropolitan University", "Birmingham City University",
  "University of Bolton", "University of Salford", "Sheffield Hallam University",
  "Leeds Beckett University", "Nottingham Trent University", "De Montfort University",
  "Northumbria University", "University of Hertfordshire", "Middlesex University",
  "Brunel University London", "Aston University", "University of Bradford",
  "Cranfield University", "University of Warwick", "University of Glasgow",
  "University of Edinburgh", "Cardiff University", "Queen's University Belfast",
] as const;
