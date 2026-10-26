# Admin Management API

All endpoints require an authenticated admin user. Responses follow the existing shape:

```json
{ "status": "success", "data": {} }
```

## Teams

`GET /api/admin/teams?page=1&limit=10&search=hyd&status=APPROVED`

```json
{
  "status": "success",
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 },
  "data": [
    {
      "_id": "665f...",
      "teamName": "Sri Lakshmi Team",
      "status": "APPROVED",
      "membersCount": 4,
      "bullsCount": 2
    }
  ]
}
```

`PUT /api/admin/teams/:id`

```json
{
  "teamName": "Sri Lakshmi Team",
  "status": "APPROVED",
  "isActive": true,
  "teamLocation": {
    "village": "Mellacheruvu",
    "district": "Suryapet",
    "state": "Telangana"
  }
}
```

`DELETE /api/admin/teams/:id` soft deletes the team, closes active memberships, and soft deletes its bulls.

## Members

`POST /api/admin/teams/:id/members`

```json
{
  "name": "Ravi",
  "phone": "9876543210",
  "role": "DRIVER",
  "info": "Primary driver"
}
```

`PUT /api/admin/members/:memberId`

```json
{
  "name": "Ravi Kumar",
  "phone": "9876543210",
  "role": "CAPTAIN",
  "info": "Captain and driver"
}
```

`DELETE /api/admin/members/:memberId` marks the membership as ended.

## Bulls

`GET /api/admin/bulls?page=1&limit=10&search=raja&teamId=665f...`

`POST /api/admin/bulls` accepts `multipart/form-data` with optional `image`.

```json
{
  "name": "Raja",
  "teamId": "665f...",
  "age": 5,
  "breed": "Ongole",
  "weight": 620,
  "healthStatus": "HEALTHY",
  "status": "ACTIVE",
  "currentCategory": { "type": "AGE_GROUP", "value": "SENIOR" }
}
```

`PUT /api/admin/bulls/:id` uses the same fields. `DELETE /api/admin/bulls/:id` soft deletes the bull.
