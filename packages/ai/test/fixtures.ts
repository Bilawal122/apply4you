import type { Profile } from "@apply4you/shared";

export const FIXTURE_PROFILE: Profile = {
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan.reyes@example.com",
  phone: "+1 415 555 0182",
  location: "San Francisco, CA",
  links: {
    linkedin: "https://linkedin.com/in/jordanreyes",
    github: "https://github.com/jreyes",
  },
  workAuthorization: "US citizen",
  workHistory: [
    {
      company: "Acme Analytics",
      title: "Senior Software Engineer",
      start: "2021-03",
      end: "present",
      bullets: ["Led migration of billing pipeline to event-driven architecture", "Cut p95 latency 40%"],
    },
    {
      company: "DataCo",
      title: "Software Engineer",
      start: "2018-06",
      end: "2021-02",
      bullets: ["Built ETL pipelines in Python and Airflow"],
    },
  ],
  education: [
    { school: "UC Berkeley", degree: "BS", field: "Computer Science", start: "2014-08", end: "2018-05" },
  ],
  skills: ["TypeScript", "Python", "Postgres", "AWS"],
  summary: "Software engineer with 8 years of experience in data infrastructure and backend systems.",
  additionalInfo: "",
};
