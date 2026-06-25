import { Button, ButtonFrame } from 'frontend';

export function PrimarySecondary() {
  return (
    <ButtonFrame>
      <Button variant="primary">Confirm</Button>
      <Button variant="secondary">Cancel</Button>
    </ButtonFrame>
  );
}

export function DangerWithCancel() {
  return (
    <ButtonFrame>
      <Button variant="danger">Delete</Button>
      <Button variant="secondary">Go back</Button>
    </ButtonFrame>
  );
}

export function SingleAction() {
  return (
    <ButtonFrame>
      <Button variant="primary">Save changes</Button>
    </ButtonFrame>
  );
}
