-- A task inserted without a number gets the next one of its project. Doing it
-- in the database makes it atomic (the UPDATE locks the project row, so two
-- tasks created at the same time cannot get the same number) and covers every
-- way of inserting a task, not just the createTask action.
ALTER TABLE "Task" ALTER COLUMN "number" SET DEFAULT 0;

CREATE FUNCTION "task_assign_number"() RETURNS trigger AS $$
BEGIN
    IF NEW."number" IS NULL OR NEW."number" = 0 THEN
        UPDATE "Project"
        SET "taskCounter" = "taskCounter" + 1
        WHERE "id" = NEW."projectId"
        RETURNING "taskCounter" INTO NEW."number";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Task_assign_number"
BEFORE INSERT ON "Task"
FOR EACH ROW EXECUTE FUNCTION "task_assign_number"();
