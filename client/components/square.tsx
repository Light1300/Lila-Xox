interface SquareProps {
  value: number | null; 
  onSquareClick: () => void;
}

const Square: React.FC<SquareProps> = ({ value, onSquareClick }) => {
  let content: string;
  if (value === 1) {
    content = 'O';
  } else if (value === 0) {
    content = 'X';
  } else {
    content = '';
  }

  return (
    <>
      <div className='square' onClick={onSquareClick}>
        {content}
      </div>
    </>
  );
};

export default Square;
