import './styles.scss';

type CheckStatus = 'success' | 'warning' | 'error';

interface CheckedProps {
  checkStatus?: CheckStatus;
}

const Checked: React.FC<CheckedProps> = ({
  checkStatus = 'success',
}) => {
  return (
    <div>
      <label className="container">
        <input type="checkbox" defaultChecked={true} />
        <div className={`checkmark-${checkStatus}`}></div>
      </label>
    </div>
  );
};

export default Checked;
