import { UniqueEntityId } from './unique-entity-id';

export abstract class Entity<Props> {
  private readonly _id: UniqueEntityId;
  protected props: Props;

  protected constructor(props: Props, id?: UniqueEntityId) {
    this.props = props;
    this._id = id ?? new UniqueEntityId();
  }

  get id(): UniqueEntityId {
    return this._id;
  }

  equals(other: Entity<unknown>): boolean {
    return other === this || other.id.equals(this._id);
  }
}
