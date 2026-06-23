import { Button } from 'frontend';

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

export function Primary() {
  return <Button variant="primary">Start quest</Button>;
}

export function Secondary() {
  return <Button variant="secondary">Cancel</Button>;
}

export function Danger() {
  return <Button variant="danger">Delete character</Button>;
}

export function SecondaryDanger() {
  return <Button variant="secondaryDanger">Remove</Button>;
}

export function WithIcon() {
  return <Button variant="primary" icon={<StarIcon />}>Favourite</Button>;
}

export function Disabled() {
  return <Button variant="primary" disabled>Unavailable</Button>;
}

export function AsLink() {
  return <Button as="a" href="#" variant="secondary">View details</Button>;
}
