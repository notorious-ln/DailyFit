```dbdiagram
Table users {
  id int [pk]
  email string
  password_hash string
  display_name string
  role string
  goal int
  level int
}

Table templates {
  id int [pk]
  type string
  title string
  level_place string
  body_json json
  is_visible boolean
}

Table active_plans {
  id int [pk]
  user_id int [ref: > users.id]
  template_id int [ref: > templates.id]
  is_active boolean
  started_at datetime
  ended_at datetime
}

Table day_tasks {
  id int [pk]
  plan_id int [ref: > active_plans.id]
  task_date date
  kind string
  title string
  status string
  details_json json
  completed_at datetime
}

Table diary_notes {
  id int [pk]
  user_id int [ref: > users.id]
  note_date date
  feeling string
  weight_kg float
  user_comment string
  advisor_comment string
}

Table recommendations {
  id int [pk]
  user_id int [ref: > users.id]
  period_from date
  period_to date
  source string
  status string
  summary_text string
  items_json json
  created_at datetime
}
```