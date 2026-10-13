import Icon from "./Icon";

export default function PageBack({ onClick }) {
  return (
    <button className="page-back" onClick={onClick} aria-label="Back to home">
      <Icon name="back" />
      <span>Back</span>
    </button>
  );
}
