import styles from '@/styles/loading-dots.module.css';

const LoadingDots = ({
  color = '#000',
  variant = 'small',
}: {
  color: string;
  variant: string;
}) => {
  return (
    <span className={variant === 'small' ? styles.loading2 : styles.loading}>
      <span style={{ backgroundColor: color }} />
      <span style={{ backgroundColor: color }} />
      <span style={{ backgroundColor: color }} />
    </span>
  );
};

export default LoadingDots;
