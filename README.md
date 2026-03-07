# 방 예약 웹앱

Next.js + Prisma + PostgreSQL 기반 방 예약 시스템입니다.

## 핵심 구조
- DB: PostgreSQL
- API: Next.js Route Handler
- 동시성 보호: 트랜잭션(Serializable) + Advisory Lock + 충돌 재시도
- 비밀번호: bcrypt 해시 저장

## 1. 컴퓨터를 항상 켜두지 않는 방법 (Vercel 권장)
이 프로젝트는 Vercel 배포를 바로 지원합니다.

### 준비
1. 코드를 GitHub 저장소에 올리기
2. 관리형 PostgreSQL 준비 (Neon, Supabase, Vercel Postgres 중 하나)
3. DB 연결 문자열 2개 준비
- `DATABASE_URL`: 풀링/런타임용 URL
- `DIRECT_URL`: 마이그레이션용 Direct URL

### Vercel 배포 순서
1. Vercel에서 GitHub 저장소 Import
2. Project Settings -> Environment Variables에 아래 3개 등록
- `DATABASE_URL`
- `DIRECT_URL`
- `ADMIN_PASSWORD`
3. Deploy 실행

이 프로젝트는 `vercel.json` + `npm run vercel-build`로 배포 시 자동으로 아래를 수행합니다.
- `prisma migrate deploy`
- `prisma generate`
- `next build`

## 2. 환경변수 예시
`.env.example` 기준:
```env
DATABASE_URL="postgresql://room_user:room_pass@localhost:5432/room_reservation?schema=public"
DIRECT_URL="postgresql://room_user:room_pass@localhost:5432/room_reservation?schema=public"
ADMIN_PASSWORD="change-this-admin-password"
```

운영 전 반드시 변경:
- `ADMIN_PASSWORD`
- DB 계정/비밀번호

## 3. 로컬 개발 실행
```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## 4. Docker로 학교 서버에 올리는 방법 (대안)
```bash
docker compose up -d --build
```
접속:
- 같은 네트워크에서 `http://서버IP:3000`

중지:
```bash
docker compose down
```

## 5. 품질 확인
```bash
npm run lint
npm run build
```
