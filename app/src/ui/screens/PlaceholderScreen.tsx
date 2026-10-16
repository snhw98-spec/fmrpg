import './PlaceholderScreen.css';

export function PlaceholderScreen({
  title,
  milestone,
  body,
}: {
  title: string;
  milestone: string;
  body: string;
}) {
  return (
    <div className="screen">
      <h1 className="screen-header">{title}</h1>
      <div className="card">
        <span className="milestone-badge">{milestone}</span>
        <p className="card-body">{body}</p>
      </div>
    </div>
  );
}
