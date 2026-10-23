ALTER TABLE orders ADD COLUMN last_actor text NOT NULL DEFAULT 'Khách / dữ liệu trước cập nhật';
ALTER TABLE table_payment_receipts ADD COLUMN orders_json text;
ALTER TABLE table_payment_receipts ADD COLUMN audit_json text;
CREATE TABLE order_audit (
 id integer PRIMARY KEY AUTOINCREMENT,
 store_id text NOT NULL,
 order_id text NOT NULL,
 session_id text,
 kind text NOT NULL,
 actor text NOT NULL,
 at integer NOT NULL,
 before_json text,
 after_json text NOT NULL
);
CREATE INDEX order_audit_visit ON order_audit(store_id,session_id,id);
INSERT INTO order_audit(store_id,order_id,session_id,kind,actor,at,after_json) SELECT o.store_id,o.id,o.dining_session_id,'baseline','Dữ liệu trước khi bật nhật ký',o.updated_at,json_object('id',o.id,'code',o.code,'table_id',o.table_id,'table_name',o.table_name,'dining_session_id',o.dining_session_id,'customer_name',o.customer_name,'items',json(CASE WHEN json_valid(o.items) THEN o.items ELSE '[]' END),'total',o.total,'note',o.note,'status',o.status,'paid',o.paid,'paid_at',o.paid_at,'payment_method',o.payment_method,'cancel_reason',o.cancel_reason,'created_at',o.created_at,'updated_at',o.updated_at) FROM orders o;
CREATE TRIGGER orders_audit_created AFTER INSERT ON orders BEGIN INSERT INTO order_audit(store_id,order_id,session_id,kind,actor,at,after_json) VALUES(NEW.store_id,NEW.id,NEW.dining_session_id,'created',NEW.last_actor,NEW.created_at,json_object('id',NEW.id,'code',NEW.code,'table_id',NEW.table_id,'table_name',NEW.table_name,'dining_session_id',NEW.dining_session_id,'customer_name',NEW.customer_name,'items',json(CASE WHEN json_valid(NEW.items) THEN NEW.items ELSE '[]' END),'total',NEW.total,'note',NEW.note,'status',NEW.status,'paid',NEW.paid,'paid_at',NEW.paid_at,'payment_method',NEW.payment_method,'cancel_reason',NEW.cancel_reason,'created_at',NEW.created_at,'updated_at',NEW.updated_at)); END;
CREATE TRIGGER orders_audit_changed AFTER UPDATE ON orders WHEN NEW.items != OLD.items OR NEW.total != OLD.total OR NEW.status != OLD.status OR NEW.paid != OLD.paid OR NEW.cancel_reason != OLD.cancel_reason BEGIN INSERT INTO order_audit(store_id,order_id,session_id,kind,actor,at,before_json,after_json) VALUES(NEW.store_id,NEW.id,NEW.dining_session_id,CASE WHEN NEW.paid != OLD.paid THEN 'payment' WHEN NEW.total != OLD.total OR NEW.status = 'cancelled' THEN 'cancel' ELSE 'progress' END,NEW.last_actor,NEW.updated_at,json_object('id',OLD.id,'code',OLD.code,'table_id',OLD.table_id,'table_name',OLD.table_name,'dining_session_id',OLD.dining_session_id,'customer_name',OLD.customer_name,'items',json(CASE WHEN json_valid(OLD.items) THEN OLD.items ELSE '[]' END),'total',OLD.total,'note',OLD.note,'status',OLD.status,'paid',OLD.paid,'paid_at',OLD.paid_at,'payment_method',OLD.payment_method,'cancel_reason',OLD.cancel_reason,'created_at',OLD.created_at,'updated_at',OLD.updated_at),json_object('id',NEW.id,'code',NEW.code,'table_id',NEW.table_id,'table_name',NEW.table_name,'dining_session_id',NEW.dining_session_id,'customer_name',NEW.customer_name,'items',json(CASE WHEN json_valid(NEW.items) THEN NEW.items ELSE '[]' END),'total',NEW.total,'note',NEW.note,'status',NEW.status,'paid',NEW.paid,'paid_at',NEW.paid_at,'payment_method',NEW.payment_method,'cancel_reason',NEW.cancel_reason,'created_at',NEW.created_at,'updated_at',NEW.updated_at)); END;
CREATE TRIGGER order_audit_no_update BEFORE UPDATE ON order_audit BEGIN SELECT RAISE(ABORT,'Order history cannot be changed'); END;
CREATE TRIGGER order_audit_no_delete BEFORE DELETE ON order_audit BEGIN SELECT RAISE(ABORT,'Order history cannot be deleted'); END;
CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders BEGIN SELECT RAISE(ABORT,'Called orders cannot be deleted'); END;
CREATE TRIGGER table_receipt_immutable BEFORE UPDATE ON table_payment_receipts WHEN NEW.audit_json IS NOT OLD.audit_json OR NEW.orders_json IS NOT OLD.orders_json OR NEW.amount != OLD.amount OR NEW.order_ids_json != OLD.order_ids_json OR NEW.paid_at != OLD.paid_at OR NEW.payment_method != OLD.payment_method BEGIN SELECT RAISE(ABORT,'Paid invoice cannot be changed'); END;
CREATE TRIGGER table_receipt_no_delete BEFORE DELETE ON table_payment_receipts BEGIN SELECT RAISE(ABORT,'Paid invoice cannot be deleted'); END;
