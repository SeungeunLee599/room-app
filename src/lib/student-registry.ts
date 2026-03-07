import allowedStudents from "@/data/allowed-students.json";

type AllowedStudent = {
  studentId: string;
  name: string;
};

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

const allowedStudentMap = new Map(
  (allowedStudents as AllowedStudent[]).map((item) => [
    item.studentId.trim(),
    normalizeName(item.name.trim()),
  ]),
);

export function isAllowedStudentName(studentId: string, name: string): boolean {
  const expected = allowedStudentMap.get(studentId.trim());
  if (!expected) {
    return false;
  }

  return expected === normalizeName(name.trim());
}

