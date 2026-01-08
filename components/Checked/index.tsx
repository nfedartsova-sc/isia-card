import './styles.scss';

type CheckStatus = 'success' | 'warning' | 'error';

interface CheckedProps {
  checkStatus?: CheckStatus;
}

const Checked: React.FC<CheckedProps> = ({
  checkStatus = 'success',
}) => {
  return (
    <div className={`checkmark checkmark-${checkStatus}`}></div>
  );
};

export default Checked;
