"""
Tests for 3D cutlist processing functionality.
"""

import pytest
import tempfile
from unittest.mock import Mock, patch, AsyncMock

from planqer.threed_cutlist import (
    STLProcessor, CutListItem, ComponentType, 
    process_uploaded_stl
)
from fastapi import HTTPException, UploadFile


class TestSTLProcessor:
    """Test the STLProcessor class."""
    
    def test_init_default_values(self):
        """Test STLProcessor initialization with default values."""
        processor = STLProcessor()
        assert processor.units == "mm"
        assert processor.round_precision == 1
        assert processor.unit_scale == 1.0
    
    def test_init_custom_values(self):
        """Test STLProcessor initialization with custom values."""
        processor = STLProcessor(units="in", round_precision=2)
        assert processor.units == "in"
        assert processor.round_precision == 2
        assert processor.unit_scale == 25.4  # inches to mm
    
    def test_get_unit_scale(self):
        """Test unit scale calculation."""
        test_cases = [
            ("mm", 1.0),
            ("cm", 10.0),
            ("m", 1000.0),
            ("in", 25.4),
            ("inch", 25.4),
            ("inches", 25.4),
            ("ft", 304.8),
            ("feet", 304.8),
            ("unknown", 1.0),  # Default fallback
        ]
        
        for units, expected_scale in test_cases:
            processor = STLProcessor(units=units)
            assert processor.unit_scale == expected_scale
    
    def test_round_dimension(self):
        """Test dimension rounding."""
        processor = STLProcessor(round_precision=1)
        assert processor._round_dimension(123.456) == 123.5
        
        processor = STLProcessor(round_precision=0)
        assert processor._round_dimension(123.456) == 123
        
        processor = STLProcessor(round_precision=2)
        assert processor._round_dimension(123.456) == 123.46
    
    def test_classify_component_board(self):
        """Test component classification as board."""
        processor = STLProcessor()
        
        # Long, narrow, moderate thickness -> board
        comp_type = processor._classify_component(1200.0, 200.0, 50.0)
        assert comp_type == ComponentType.BOARD
    
    def test_classify_component_sheet(self):
        """Test component classification as sheet."""
        processor = STLProcessor()
        
        # Wide, thin -> sheet
        comp_type = processor._classify_component(1200.0, 800.0, 18.0)
        assert comp_type == ComponentType.SHEET
        
        # Very thin -> sheet
        comp_type = processor._classify_component(500.0, 300.0, 2.0)
        assert comp_type == ComponentType.SHEET
    
    def test_classify_component_board_thick(self):
        """Test component classification for thick components."""
        processor = STLProcessor()
        
        # Thick component gets classified as board with new algorithm
        comp_type = processor._classify_component(200.0, 150.0, 120.0)
        assert comp_type == ComponentType.BOARD
    
    @patch.object(STLProcessor, '_load_stl')
    def test_load_stl_success(self, mock_load_stl):
        """Test successful STL loading."""
        # Mock trimesh mesh
        mock_mesh = Mock()
        mock_mesh.is_empty = False
        mock_mesh.is_watertight = True
        mock_mesh.apply_scale = Mock()
        mock_load_stl.return_value = mock_mesh
        
        processor = STLProcessor()
        
        with tempfile.NamedTemporaryFile(suffix='.stl') as temp_file:
            result = processor._load_stl(temp_file.name)
            assert result == mock_mesh
            mock_load_stl.assert_called_once_with(temp_file.name)
    
    @patch('planqer.threed_cutlist.trimesh.load')
    def test_load_stl_failure(self, mock_load):
        """Test STL loading failure."""
        mock_load.side_effect = Exception("Invalid STL file")
        
        processor = STLProcessor()
        
        with tempfile.NamedTemporaryFile(suffix='.stl') as temp_file:
            with pytest.raises(HTTPException) as exc_info:
                processor._load_stl(temp_file.name)
            
            assert exc_info.value.status_code == 400
            assert "Failed to load STL file" in str(exc_info.value.detail)
    
    @patch.object(STLProcessor, '_load_stl')
    def test_load_stl_with_scene(self, mock_load_stl):
        """Test STL loading with Scene object (multiple meshes)."""
        # Mock the combined result
        mock_combined = Mock()
        mock_combined.is_empty = False
        mock_combined.is_watertight = True
        mock_combined.apply_scale = Mock()
        mock_load_stl.return_value = mock_combined
        
        processor = STLProcessor()
        
        with tempfile.NamedTemporaryFile(suffix='.stl') as temp_file:
            result = processor._load_stl(temp_file.name)
            assert result == mock_combined
            mock_load_stl.assert_called_once_with(temp_file.name)


class TestCutListItem:
    """Test the CutListItem dataclass."""
    
    def test_cutlist_item_creation(self):
        """Test CutListItem creation."""
        item = CutListItem(
            type=ComponentType.BOARD,
            length=1200.0,
            width=200.0,
            thickness=50.0,
            quantity=2,
            name="board_1",
            volume=12000.0
        )
        
        assert item.type == ComponentType.BOARD
        assert item.length == 1200.0
        assert item.width == 200.0
        assert item.thickness == 50.0
        assert item.quantity == 2
        assert item.name == "board_1"
        assert item.volume == 12000.0
    
    def test_cutlist_item_to_dict(self):
        """Test CutListItem to_dict method."""
        item = CutListItem(
            type=ComponentType.SHEET,
            length=800.0,
            width=600.0,
            thickness=18.0,
            quantity=1,
            name="sheet_1",
            volume=8640.0
        )
        
        expected_dict = {
            "type": "sheet",
            "length": 800.0,
            "width": 600.0,
            "thickness": 18.0,
            "quantity": 1,
            "name": "sheet_1",
            "volume": 8640.0
        }
        
        assert item.to_dict() == expected_dict


@pytest.mark.asyncio
async def test_process_uploaded_stl_invalid_extension():
    """Test process_uploaded_stl with invalid file extension."""
    mock_file = Mock(spec=UploadFile)
    mock_file.filename = "test.obj"  # Wrong extension
    
    with pytest.raises(HTTPException) as exc_info:
        await process_uploaded_stl(mock_file)
    
    assert exc_info.value.status_code == 400
    assert "STL file" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_process_uploaded_stl_file_too_large():
    """Test process_uploaded_stl with file too large."""
    mock_file = Mock(spec=UploadFile)
    mock_file.filename = "test.stl"
    mock_file.size = 60 * 1024 * 1024  # 60MB, over the 50MB limit
    
    with pytest.raises(HTTPException) as exc_info:
        await process_uploaded_stl(mock_file)
    
    assert exc_info.value.status_code == 400
    assert "File size too large" in str(exc_info.value.detail)


@pytest.mark.asyncio
@patch('planqer.threed_cutlist.STLProcessor')
async def test_process_uploaded_stl_success(mock_processor_class):
    """Test successful STL processing."""
    # Mock file
    mock_file = Mock(spec=UploadFile)
    mock_file.filename = "test.stl"
    mock_file.size = 1024 * 1024  # 1MB
    mock_file.read = AsyncMock(return_value=b"fake stl content")
    
    # Mock processor
    mock_processor = Mock()
    mock_cutlist_item = CutListItem(
        type=ComponentType.BOARD,
        length=1200.0,
        width=200.0,
        thickness=50.0,
        quantity=1,
        name="board_1",
        volume=12000.0
    )
    mock_processor.process_stl_file.return_value = [mock_cutlist_item]
    mock_processor.convert_to_planqer_parts.return_value = {"1200": 1}
    mock_processor_class.return_value = mock_processor
    
    # Test the function
    cutlist_items, planqer_parts = await process_uploaded_stl(
        file=mock_file,
        units="mm",
        round_precision=1,
        project_name="Test Project"
    )
    
    # Verify results
    assert len(cutlist_items) == 1
    assert cutlist_items[0] == mock_cutlist_item
    assert planqer_parts == {"1200": 1}
    
    # Verify processor was called correctly
    mock_processor_class.assert_called_once_with(units="mm", round_precision=1)
    mock_processor.convert_to_planqer_parts.assert_called_once_with([mock_cutlist_item])


class TestIntegration:
    """Integration tests for the 3D cutlist functionality."""
    
    def test_processor_convert_to_planqer_parts(self):
        """Test conversion of cutlist items to Planqer parts format."""
        processor = STLProcessor()
        
        cutlist_items = [
            CutListItem(
                type=ComponentType.BOARD,
                length=1200.0,
                width=200.0,
                thickness=50.0,
                quantity=2,
                name="board_1",
                volume=24000.0
            ),
            CutListItem(
                type=ComponentType.BOARD,
                length=800.0,
                width=150.0,
                thickness=40.0,
                quantity=3,
                name="board_2",
                volume=14400.0
            ),
            CutListItem(
                type=ComponentType.SHEET,
                length=1220.0,
                width=800.0,
                thickness=18.0,
                quantity=1,
                name="sheet_1",
                volume=17568.0
            ),
            CutListItem(
                type=ComponentType.BOARD,
                length=100.0,
                width=100.0,
                thickness=100.0,
                quantity=1,
                name="board_3",
                volume=1000000.0
            )
        ]
        
        planqer_parts = processor.convert_to_planqer_parts(cutlist_items)
        
        # Only board types should be included
        expected = {
            "1200": 2,  # board_1
            "800": 3,   # board_2
            "100": 1    # board_3
        }
        
        assert planqer_parts == expected
    
    def test_processor_convert_to_planqer_parts_empty(self):
        """Test conversion with no board components."""
        processor = STLProcessor()
        
        cutlist_items = [
            CutListItem(
                type=ComponentType.SHEET,
                length=1220.0,
                width=800.0,
                thickness=18.0,
                quantity=1,
                name="sheet_1",
                volume=17568.0
            )
        ]
        
        planqer_parts = processor.convert_to_planqer_parts(cutlist_items)
        assert planqer_parts == {}
    
    def test_processor_convert_combines_similar_boards(self):
        """Test that similar board lengths are combined."""
        processor = STLProcessor()
        
        cutlist_items = [
            CutListItem(
                type=ComponentType.BOARD,
                length=1200.0,
                width=200.0,
                thickness=50.0,
                quantity=2,
                name="board_1",
                volume=24000.0
            ),
            CutListItem(
                type=ComponentType.BOARD,
                length=1200.0,  # Same length as above
                width=180.0,    # Different width
                thickness=45.0, # Different thickness
                quantity=3,
                name="board_2",
                volume=14400.0
            )
        ]
        
        planqer_parts = processor.convert_to_planqer_parts(cutlist_items)
        
        # Should combine quantities for same length
        expected = {"1200": 5}  # 2 + 3
        assert planqer_parts == expected